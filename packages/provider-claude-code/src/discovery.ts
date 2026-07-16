import { open, readdir, stat } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import type { TrackCapabilities, TrackSummary } from "@tracks/core-model";
import type { ProviderTrackDescriptor } from "@tracks/provider-sdk";
import {
  asString,
  compactText,
  isRecord,
  readMessage,
  readRecordType,
  stableId,
  toIsoDate,
  type UnknownRecord,
} from "./utils.js";

const HEAD_BYTES = 256 * 1024;
const RECENT_WINDOW_MS = 90 * 1000;

export interface ClaudeTrackReference {
  sourcePath: string;
  sourceSize: number;
  sourceMtimeMs: number;
}

interface HeadEvidence {
  sessionId: string | null;
  cwd: string | null;
  title: string | null;
  startedAt: string | null;
  capabilities: TrackCapabilities;
}

const EMPTY_CAPABILITIES: TrackCapabilities = {
  reasoning: false,
  toolResults: false,
  usage: false,
  fileChanges: false,
  subagents: false,
  rawEvidence: true,
};

function textFromContent(content: unknown): string | null {
  if (typeof content === "string") {
    return titleFromText(content);
  }

  if (!Array.isArray(content)) {
    return null;
  }

  for (const block of content) {
    if (!isRecord(block) || block.type !== "text") {
      continue;
    }

    const text = asString(block.text);
    if (text) {
      const title = titleFromText(text);
      if (title) return title;
    }
  }

  return null;
}

function titleFromText(text: string): string | null {
  const commandName = text.match(/<command-name>([^<]+)<\/command-name>/)?.[1];
  if (commandName) {
    return compactText(commandName);
  }

  if (
    text.includes("<local-command-caveat>")
    || text.includes("<system-reminder>")
  ) {
    return null;
  }

  const title = compactText(text);
  return title || null;
}

function observeRecord(evidence: HeadEvidence, record: UnknownRecord): void {
  evidence.sessionId ??= asString(record.sessionId);
  evidence.cwd ??= asString(record.cwd);
  evidence.startedAt ??= toIsoDate(record.timestamp);

  const recordType = readRecordType(record);
  const message = readMessage(record);
  const content = message?.content;

  if (recordType === "user" && !evidence.title) {
    evidence.title = textFromContent(content);
  }

  if (isRecord(message?.usage)) {
    evidence.capabilities.usage = true;
  }

  if (!Array.isArray(content)) {
    return;
  }

  for (const block of content) {
    if (!isRecord(block)) {
      continue;
    }

    if (block.type === "thinking") {
      evidence.capabilities.reasoning = true;
    } else if (block.type === "tool_result") {
      evidence.capabilities.toolResults = true;
    } else if (block.type === "tool_use") {
      const name = asString(block.name)?.toLowerCase() ?? "";
      if (["edit", "write", "notebookedit"].some((part) => name.includes(part))) {
        evidence.capabilities.fileChanges = true;
      }
      if (["task", "agent"].some((part) => name.includes(part))) {
        evidence.capabilities.subagents = true;
      }
    }
  }
}

async function readHeadEvidence(sourcePath: string): Promise<HeadEvidence> {
  const evidence: HeadEvidence = {
    sessionId: null,
    cwd: null,
    title: null,
    startedAt: null,
    capabilities: { ...EMPTY_CAPABILITIES },
  };

  const handle = await open(sourcePath, "r");
  try {
    const buffer = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEAD_BYTES, 0);
    const text = buffer.subarray(0, bytesRead).toString("utf8");
    const lines = text.split("\n");

    if (bytesRead === HEAD_BYTES) {
      lines.pop();
    }

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      try {
        const parsed: unknown = JSON.parse(line);
        if (isRecord(parsed)) {
          observeRecord(evidence, parsed);
        }
      } catch {
        // A partial head read and actively written tails are expected. Full parsing reports diagnostics.
      }
    }
  } finally {
    await handle.close();
  }

  return evidence;
}

function fallbackProjectLabel(directoryName: string): string {
  const segments = directoryName.split("-").filter(Boolean);
  return segments.at(-1) ?? directoryName;
}

export async function discoverClaudeTracks(
  sourceRoot: string,
): Promise<Array<ProviderTrackDescriptor<ClaudeTrackReference>>> {
  const projectEntries = await readdir(sourceRoot, { withFileTypes: true });
  const tracks: Array<ProviderTrackDescriptor<ClaudeTrackReference>> = [];

  for (const projectEntry of projectEntries) {
    if (!projectEntry.isDirectory()) {
      continue;
    }

    const projectDirectory = join(sourceRoot, projectEntry.name);
    let sessionEntries;
    try {
      sessionEntries = await readdir(projectDirectory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const sessionEntry of sessionEntries) {
      if (!sessionEntry.isFile() || !sessionEntry.name.endsWith(".jsonl")) {
        continue;
      }

      const sourcePath = join(projectDirectory, sessionEntry.name);
      let sourceStat;
      try {
        sourceStat = await stat(sourcePath);
      } catch {
        continue;
      }

      let evidence: HeadEvidence;
      try {
        evidence = await readHeadEvidence(sourcePath);
      } catch {
        continue;
      }

      const sourceRelativePath = relative(sourceRoot, sourcePath);
      const projectIdentity = stableId(projectEntry.name);
      const sessionIdentity = evidence.sessionId ?? stableId(sourceRelativePath);
      const trackId = `claude:${projectIdentity}:${sessionIdentity}`;
      const cwdLabel = evidence.cwd ? basename(evidence.cwd) : null;
      const projectLabel = cwdLabel || fallbackProjectLabel(projectEntry.name);
      const updatedAt = sourceStat.mtime.toISOString();
      const isRecent = Date.now() - sourceStat.mtimeMs <= RECENT_WINDOW_MS;

      const summary: TrackSummary = {
        id: trackId,
        providerId: "claude-code",
        providerLabel: "Claude Code",
        projectId: `claude-project:${projectIdentity}`,
        projectLabel,
        title: evidence.title || "Untitled Claude session",
        startedAt: evidence.startedAt,
        updatedAt,
        entryCount: null,
        sourceBytes: sourceStat.size,
        state: isRecent ? "recent" : "unknown",
        capabilities: evidence.capabilities,
      };

      tracks.push({
        summary,
        reference: {
          sourcePath,
          sourceSize: sourceStat.size,
          sourceMtimeMs: sourceStat.mtimeMs,
        },
      });
    }
  }

  return tracks;
}
