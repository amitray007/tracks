import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type {
  Track,
  TrackDiagnostic,
  TrackEntry,
  TrackSummary,
  ToolCallEntry,
} from "@tracks/core-model";
import type { LoadTrackOptions } from "@tracks/provider-sdk";
import type { ClaudeTrackReference } from "./discovery.js";
import {
  asString,
  isRecord,
  readMessage,
  readRecordType,
  stableId,
  toIsoDate,
  type UnknownRecord,
} from "./utils.js";

const MAX_DIAGNOSTICS = 50;

function toolCategory(name: string): ToolCallEntry["category"] {
  const normalized = name.toLowerCase();
  if (["bash", "shell", "terminal", "command"].some((part) => normalized.includes(part))) {
    return "command";
  }
  if (["grep", "glob", "search", "find"].some((part) => normalized.includes(part))) {
    return "search";
  }
  if (["read", "open"].some((part) => normalized.includes(part))) {
    return "read";
  }
  if (["edit", "write", "notebook"].some((part) => normalized.includes(part))) {
    return "write";
  }
  if (["task", "agent"].some((part) => normalized.includes(part))) {
    return "agent";
  }
  return "other";
}

function entryBase(
  record: UnknownRecord,
  lineNumber: number,
  blockIndex: number,
  sequence: number,
) {
  const providerId = asString(record.uuid) ?? asString(record.id);
  return {
    id: providerId
      ? `${providerId}:${blockIndex}`
      : `entry:${stableId(lineNumber, blockIndex)}`,
    sequence,
    timestamp: toIsoDate(record.timestamp),
    providerRecordKind: readRecordType(record),
  };
}

function unsupportedEntry(
  record: UnknownRecord,
  lineNumber: number,
  blockIndex: number,
  sequence: number,
  summary: string,
): TrackEntry {
  return {
    ...entryBase(record, lineNumber, blockIndex, sequence),
    kind: "unsupported",
    summary,
    rawAvailable: true,
  };
}

function entriesFromMessageRecord(
  record: UnknownRecord,
  lineNumber: number,
  sequenceStart: number,
): TrackEntry[] {
  const recordType = readRecordType(record);
  const role = recordType === "user" ? "user" : "assistant";
  const message = readMessage(record);
  const content = message?.content;

  if (typeof content === "string") {
    return [
      {
        ...entryBase(record, lineNumber, 0, sequenceStart),
        kind: "message",
        role,
        text: content,
      },
    ];
  }

  if (!Array.isArray(content)) {
    return [
      unsupportedEntry(
        record,
        lineNumber,
        0,
        sequenceStart,
        `${recordType ?? "Unknown"} record has no supported message content`,
      ),
    ];
  }

  const entries: TrackEntry[] = [];
  for (const [blockIndex, block] of content.entries()) {
    const sequence = sequenceStart + entries.length;
    if (!isRecord(block)) {
      entries.push(
        unsupportedEntry(record, lineNumber, blockIndex, sequence, "Unsupported message block"),
      );
      continue;
    }

    const blockType = asString(block.type);
    if (blockType === "text") {
      entries.push({
        ...entryBase(record, lineNumber, blockIndex, sequence),
        kind: "message",
        role,
        text: asString(block.text) ?? "",
      });
    } else if (blockType === "thinking") {
      const text = asString(block.thinking);
      entries.push({
        ...entryBase(record, lineNumber, blockIndex, sequence),
        kind: "reasoning",
        text,
        availability: text ? "available" : "unavailable",
      });
    } else if (blockType === "tool_use") {
      const name = asString(block.name) ?? "Unknown tool";
      entries.push({
        ...entryBase(record, lineNumber, blockIndex, sequence),
        kind: "tool_call",
        toolUseId: asString(block.id),
        name,
        category: toolCategory(name),
        input: block.input ?? null,
      });
    } else if (blockType === "tool_result") {
      entries.push({
        ...entryBase(record, lineNumber, blockIndex, sequence),
        kind: "tool_result",
        toolUseId: asString(block.tool_use_id),
        content: block.content ?? null,
        isError: block.is_error === true,
      });
    } else {
      entries.push(
        unsupportedEntry(
          record,
          lineNumber,
          blockIndex,
          sequence,
          blockType ? `Unsupported Claude content block: ${blockType}` : "Unknown content block",
        ),
      );
    }
  }

  return entries.length > 0
    ? entries
    : [
        unsupportedEntry(
          record,
          lineNumber,
          0,
          sequenceStart,
          `${recordType ?? "Unknown"} record has empty content`,
        ),
      ];
}

function entriesFromRecord(
  record: UnknownRecord,
  lineNumber: number,
  sequenceStart: number,
): TrackEntry[] {
  const recordType = readRecordType(record);
  if (recordType === "user" || recordType === "assistant") {
    if (record.isMeta === true) {
      return [
        unsupportedEntry(
          record,
          lineNumber,
          0,
          sequenceStart,
          "Claude metadata message",
        ),
      ];
    }
    return entriesFromMessageRecord(record, lineNumber, sequenceStart);
  }

  if (recordType === "system") {
    const subtype = asString(record.subtype);
    const detail = asString(record.message) ?? asString(record.content);
    return [
      {
        ...entryBase(record, lineNumber, 0, sequenceStart),
        kind: "status",
        label: subtype ? `System · ${subtype}` : "System event",
        detail,
        tone: record.level === "error" ? "danger" : "neutral",
      },
    ];
  }

  return [
    unsupportedEntry(
      record,
      lineNumber,
      0,
      sequenceStart,
      recordType ? `Claude record: ${recordType}` : "Claude record without a type",
    ),
  ];
}

export async function parseClaudeTrack(
  summary: TrackSummary,
  reference: ClaudeTrackReference,
  options: LoadTrackOptions,
): Promise<Track> {
  const entries: TrackEntry[] = [];
  const diagnostics: TrackDiagnostic[] = [];
  const startSequence = options.startSequence ?? 0;
  let sequence = 0;
  let lineNumber = 0;
  let truncated = false;

  const input = createReadStream(reference.sourcePath, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });

  for await (const line of lines) {
    lineNumber += 1;
    if (!line.trim()) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      if (diagnostics.length < MAX_DIAGNOSTICS) {
        diagnostics.push({
          severity: "warning",
          code: "claude.invalid-jsonl-record",
          message: "A malformed JSONL record was retained as unsupported evidence.",
          approximateLine: lineNumber,
        });
      }

      if (sequence >= startSequence && entries.length < options.entryLimit) {
        entries.push({
          id: `malformed:${stableId(lineNumber)}`,
          sequence,
          timestamp: null,
          providerRecordKind: null,
          kind: "unsupported",
          summary: "Malformed Claude Code record",
          rawAvailable: true,
        });
      }
      sequence += 1;
    }

    if (isRecord(parsed)) {
      const recordEntries = entriesFromRecord(parsed, lineNumber, sequence);
      for (const entry of recordEntries) {
        if (entry.sequence >= startSequence && entries.length < options.entryLimit) {
          entries.push(entry);
        }
      }
      sequence += recordEntries.length;
    } else if (parsed !== undefined) {
      if (sequence >= startSequence && entries.length < options.entryLimit) {
        entries.push({
          id: `invalid-shape:${stableId(lineNumber)}`,
          sequence,
          timestamp: null,
          providerRecordKind: null,
          kind: "unsupported",
          summary: "Claude record is not a JSON object",
          rawAvailable: true,
        });
      }
      sequence += 1;
    }

    if (entries.length >= options.entryLimit) {
      truncated = true;
      lines.close();
      input.destroy();
      break;
    }
  }

  return {
    summary: {
      ...summary,
      entryCount: truncated ? null : sequence,
    },
    entries,
    diagnostics,
    truncated,
    nextSequence: truncated ? startSequence + entries.length : null,
  };
}
