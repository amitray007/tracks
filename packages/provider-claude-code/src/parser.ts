import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type {
  EntryActivity,
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

interface ClaudeTaskNotification {
  taskId: string;
  toolUseId: string;
  status: string;
  summary: string | null;
  note: string | null;
  result: string | null;
  usage: {
    subagentTokens: number | null;
    toolUses: number | null;
    durationMs: number | null;
  };
}

function taggedValue(source: string, tag: string, useLastClosingTag = false): string | null {
  const openingTag = `<${tag}>`;
  const closingTag = `</${tag}>`;
  const start = source.indexOf(openingTag);
  if (start < 0) return null;
  const contentStart = start + openingTag.length;
  const end = useLastClosingTag
    ? source.lastIndexOf(closingTag)
    : source.indexOf(closingTag, contentStart);
  if (end < contentStart) return null;
  const value = source.slice(contentStart, end).trim();
  return value || null;
}

function taggedNumber(source: string, tag: string): number | null {
  const value = taggedValue(source, tag);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseTaskNotification(value: string): ClaudeTaskNotification | null {
  const source = value.trim();
  if (!source.startsWith("<task-notification>") || !source.endsWith("</task-notification>")) {
    return null;
  }

  const taskId = taggedValue(source, "task-id");
  const toolUseId = taggedValue(source, "tool-use-id");
  const status = taggedValue(source, "status");
  if (!taskId || !toolUseId || !status) return null;

  const usageSource = taggedValue(source, "usage") ?? "";
  return {
    taskId,
    toolUseId,
    status,
    summary: taggedValue(source, "summary"),
    note: taggedValue(source, "note"),
    result: taggedValue(source, "result", true),
    usage: {
      subagentTokens: taggedNumber(usageSource, "subagent_tokens"),
      toolUses: taggedNumber(usageSource, "tool_uses"),
      durationMs: taggedNumber(usageSource, "duration_ms"),
    },
  };
}

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

function toolInputRecord(value: unknown): UnknownRecord | null {
  return isRecord(value) ? value : null;
}

function toolInputPath(value: unknown): string | null {
  const input = toolInputRecord(value);
  return asString(input?.file_path) ?? asString(input?.path) ?? asString(input?.notebook_path);
}

function isClaudeMemoryPath(value: string): boolean {
  const normalized = value.replaceAll("\\", "/");
  return /\/\.claude\/projects\/[^/]+\/memory\//i.test(normalized)
    || /\/\.claude\/memory\//i.test(normalized);
}

function mcpParts(name: string): { server: string; tool: string } | null {
  if (!name.startsWith("mcp__")) return null;
  const [, server, ...toolParts] = name.split("__");
  if (!server) return null;
  return { server, tool: toolParts.join("__") || "tool" };
}

function activityForTool(name: string, input: unknown): EntryActivity | undefined {
  if (name === "Skill") {
    const skill = asString(toolInputRecord(input)?.skill) ?? "Skill";
    return {
      kind: "skill",
      label: skill,
      operation: "invoke",
      data: {
        skill,
        args: asString(toolInputRecord(input)?.args),
      },
    };
  }

  const mcp = mcpParts(name);
  if (mcp) {
    return {
      kind: "mcp",
      label: mcp.server,
      operation: mcp.tool,
      data: mcp,
    };
  }

  const path = toolInputPath(input);
  if (path && isClaudeMemoryPath(path)) {
    const category = toolCategory(name);
    return {
      kind: "memory",
      label: path.split(/[\\/]/).filter(Boolean).at(-1) ?? "Memory",
      operation: category === "read" ? "read" : "write",
      data: { path, tool: name },
    };
  }

  return undefined;
}

function parseTagAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([A-Za-z_:][-A-Za-z0-9_:]*)\s*=\s*"([^"]*)"/g;
  for (const match of source.matchAll(pattern)) {
    const [, key, value] = match;
    if (key && value !== undefined) attributes[key] = value;
  }
  return attributes;
}

function parseChannelMessage(value: string): { text: string; activity: EntryActivity } | null {
  const match = value.trim().match(/^<channel\b([^>]*)>([\s\S]*)<\/channel>\s*$/);
  if (!match) return null;
  const attributes = parseTagAttributes(match[1] ?? "");
  const source = attributes.source?.trim() || "Channel";
  return {
    text: (match[2] ?? "").trim(),
    activity: {
      kind: "channel",
      label: source,
      operation: "received",
      data: {
        source,
        topic: attributes.topic ?? null,
      },
    },
  };
}

function parseCommandMessage(value: string): { label: string; detail: string | null; activity: EntryActivity } | null {
  const source = value.trim();
  if (!source.startsWith("<command-name>")) return null;
  const name = taggedValue(source, "command-name");
  if (!name) return null;
  const label = name.startsWith("/") ? name : `/${name}`;
  const args = taggedValue(source, "command-args");
  return {
    label,
    detail: args,
    activity: {
      kind: "command",
      label,
      operation: "invoke",
      data: { command: label, args },
    },
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => asString(item)).filter((item): item is string => Boolean(item))
    : [];
}

function activityEntryFromAttachment(
  record: UnknownRecord,
  lineNumber: number,
  sequence: number,
): TrackEntry | null {
  const attachment = isRecord(record.attachment) ? record.attachment : null;
  const type = asString(attachment?.type);
  if (!attachment || !type) return null;

  if (type === "invoked_skills") {
    const skills = Array.isArray(attachment.skills)
      ? attachment.skills.flatMap((item) => {
          if (!isRecord(item)) return [];
          const name = asString(item.name);
          return name ? [name] : [];
        })
      : [];
    return {
      ...entryBase(record, lineNumber, 0, sequence),
      kind: "status",
      label: skills.length === 1 ? `Loaded ${skills[0]}` : `Loaded ${skills.length} skills`,
      detail: null,
      tone: "neutral",
      activity: {
        kind: "skill",
        label: skills[0] ?? "Skills",
        operation: "load",
        data: { skills },
      },
    };
  }

  if (type === "mcp_instructions_delta") {
    const added = stringArray(attachment.addedNames);
    const removed = stringArray(attachment.removedNames);
    return {
      ...entryBase(record, lineNumber, 0, sequence),
      kind: "status",
      label: "MCP context updated",
      detail: null,
      tone: "neutral",
      activity: {
        kind: "mcp",
        label: added[0] ?? removed[0] ?? "MCP",
        operation: "instructions",
        data: { added, removed },
      },
    };
  }

  if (type === "nested_memory") {
    const path = asString(attachment.path);
    const displayPath = asString(attachment.displayPath) ?? path;
    return {
      ...entryBase(record, lineNumber, 0, sequence),
      kind: "status",
      label: "Loaded project memory",
      detail: displayPath,
      tone: "neutral",
      activity: {
        kind: "memory",
        label: displayPath?.split(/[\\/]/).filter(Boolean).at(-1) ?? "Project memory",
        operation: "load",
        data: { path, displayPath },
      },
    };
  }

  if (type.startsWith("hook_")) {
    const hookName = asString(attachment.hookName) ?? "Hook";
    const hookEvent = asString(attachment.hookEvent) ?? "Lifecycle event";
    const isError = type.includes("error");
    const detail = asString(attachment.content)
      ?? asString(attachment.stderr)
      ?? (type === "hook_additional_context" ? "Additional context supplied to Claude." : null);
    return {
      ...entryBase(record, lineNumber, 0, sequence),
      kind: "status",
      label: `${hookEvent} · ${hookName}`,
      detail,
      tone: isError ? (type === "hook_blocking_error" ? "danger" : "warning") : "neutral",
      activity: {
        kind: "hook",
        label: hookName,
        operation: type.replace(/^hook_/, ""),
        data: {
          hookName,
          hookEvent,
          toolUseId: asString(attachment.toolUseID),
          durationMs: typeof attachment.durationMs === "number" ? attachment.durationMs : null,
          exitCode: typeof attachment.exitCode === "number" ? attachment.exitCode : null,
          timedOut: attachment.timedOut === true,
          command: asString(attachment.command),
          stdout: asString(attachment.stdout),
          stderr: asString(attachment.stderr),
        },
      },
    };
  }

  return null;
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
    const taskNotification = recordType === "user" ? parseTaskNotification(content) : null;
    if (taskNotification) {
      const normalizedStatus = taskNotification.status.toLocaleLowerCase();
      return [
        {
          ...entryBase(record, lineNumber, 0, sequenceStart),
          kind: "tool_result",
          toolUseId: taskNotification.toolUseId,
          content: {
            text: taskNotification.result
              ?? taskNotification.summary
              ?? taskNotification.note
              ?? `Agent task ${taskNotification.status}`,
            summary: taskNotification.summary,
            note: taskNotification.note,
            status: taskNotification.status,
            taskId: taskNotification.taskId,
            usage: taskNotification.usage,
          },
          isError: !["completed", "success", "succeeded"].includes(normalizedStatus),
        },
      ];
    }
    const channelMessage = recordType === "user" ? parseChannelMessage(content) : null;
    if (channelMessage) {
      return [{
        ...entryBase(record, lineNumber, 0, sequenceStart),
        kind: "message",
        role: "user",
        text: channelMessage.text,
        activity: channelMessage.activity,
      }];
    }
    const commandMessage = recordType === "user" ? parseCommandMessage(content) : null;
    if (commandMessage) {
      return [{
        ...entryBase(record, lineNumber, 0, sequenceStart),
        kind: "status",
        label: commandMessage.label,
        detail: commandMessage.detail,
        tone: "neutral",
        activity: commandMessage.activity,
      }];
    }
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
        activity: activityForTool(name, block.input),
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
      const content = readMessage(record)?.content;
      const knownStructuredMetadata = typeof content === "string"
        && (
          parseTaskNotification(content) !== null
          || parseChannelMessage(content) !== null
          || parseCommandMessage(content) !== null
        );
      if (knownStructuredMetadata) {
        return entriesFromMessageRecord(record, lineNumber, sequenceStart);
      }
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
    const hookSummary = subtype === "stop_hook_summary";
    const localCommand = subtype === "local_command";
    return [
      {
        ...entryBase(record, lineNumber, 0, sequenceStart),
        kind: "status",
        label: subtype ? `System · ${subtype}` : "System event",
        detail,
        tone: record.level === "error" ? "danger" : "neutral",
        activity: hookSummary
          ? {
              kind: "hook",
              label: "Stop hooks",
              operation: "summary",
              data: {
                hookCount: typeof record.hookCount === "number" ? record.hookCount : null,
                preventedContinuation: record.preventedContinuation === true,
                stopReason: asString(record.stopReason),
              },
            }
          : localCommand
            ? {
                kind: "command",
                label: "Local command",
                operation: "result",
              }
            : undefined,
      },
    ];
  }

  if (recordType === "attachment") {
    const activityEntry = activityEntryFromAttachment(record, lineNumber, sequenceStart);
    if (activityEntry) return [activityEntry];
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
  const direction = options.direction ?? "forward";
  const beforeSequence = options.beforeSequence ?? Number.POSITIVE_INFINITY;
  let sequence = 0;
  let lineNumber = 0;
  let truncated = false;

  const input = createReadStream(reference.sourcePath, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });

  const collectEntry = (entry: TrackEntry) => {
    if (direction === "forward") {
      if (entry.sequence >= startSequence && entries.length < options.entryLimit) {
        entries.push(entry);
      }
      return;
    }

    if (entry.sequence >= beforeSequence) return;
    entries.push(entry);
    if (entries.length > options.entryLimit) entries.shift();
  };

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

      collectEntry({
        id: `malformed:${stableId(lineNumber)}`,
        sequence,
        timestamp: null,
        providerRecordKind: null,
        kind: "unsupported",
        summary: "Malformed Claude Code record",
        rawAvailable: true,
      });
      sequence += 1;
    }

    if (isRecord(parsed)) {
      const recordEntries = entriesFromRecord(parsed, lineNumber, sequence);
      for (const entry of recordEntries) {
        collectEntry(entry);
      }
      sequence += recordEntries.length;
    } else if (parsed !== undefined) {
      collectEntry({
        id: `invalid-shape:${stableId(lineNumber)}`,
        sequence,
        timestamp: null,
        providerRecordKind: null,
        kind: "unsupported",
        summary: "Claude record is not a JSON object",
        rawAvailable: true,
      });
      sequence += 1;
    }

    if (direction === "forward" && entries.length >= options.entryLimit) {
      truncated = true;
      lines.close();
      input.destroy();
      break;
    }

    if (direction === "backward" && sequence >= beforeSequence) {
      lines.close();
      input.destroy();
      break;
    }
  }

  if (direction === "backward") {
    truncated = (entries[0]?.sequence ?? 0) > 0;
  }

  return {
    summary: {
      ...summary,
      entryCount: direction === "backward" && Number.isFinite(beforeSequence)
        ? summary.entryCount
        : truncated && direction === "forward"
          ? null
          : sequence,
    },
    entries,
    diagnostics,
    truncated,
    nextSequence: direction === "forward" && truncated ? startSequence + entries.length : null,
  };
}
