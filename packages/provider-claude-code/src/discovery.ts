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
const SUBAGENT_HEAD_BYTES = 64 * 1024;
const RECENT_WINDOW_MS = 90 * 1000;

export interface ClaudeTrackReference {
  sourcePath: string;
  sourceSize: number;
  sourceMtimeMs: number;
  sourceClass: "session" | "subagent";
  parentTrackId?: string;
  providerAgentId?: string;
  childTracksByAgentId: Record<string, ClaudeChildTrackLink>;
}

export interface ClaudeChildTrackLink {
  trackId: string;
  title: string;
}

export interface HeadEvidence {
  sessionId: string | null;
  agentId: string | null;
  attributionAgent: string | null;
  isSidechain: boolean | null;
  cwd: string | null;
  title: string | null;
  startedAt: string | null;
  capabilities: TrackCapabilities;
}

export interface ClaudeEvidenceCacheEntry {
  sourceSize: number;
  sourceMtimeMs: number;
  evidence: HeadEvidence;
}

export type ClaudeEvidenceCache = Map<string, ClaudeEvidenceCacheEntry>;

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

function titleFromAgentAttribution(attributionAgent: string): string {
  const agentName = attributionAgent.split(":").at(-1) ?? attributionAgent;
  const words = agentName
    .replace(/^ce-/, "")
    .split(/[-_\s]+/)
    .filter(Boolean);
  if (words.length === 0) return "Sub-agent";
  return words.map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`).join(" ");
}

function observeRecord(evidence: HeadEvidence, record: UnknownRecord): void {
  evidence.sessionId ??= asString(record.sessionId);
  evidence.agentId ??= asString(record.agentId);
  evidence.attributionAgent ??= asString(record.attributionAgent);
  if (evidence.isSidechain === null && typeof record.isSidechain === "boolean") {
    evidence.isSidechain = record.isSidechain;
  }
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

async function readHeadEvidence(sourcePath: string, maximumBytes = HEAD_BYTES): Promise<HeadEvidence> {
  const evidence: HeadEvidence = {
    sessionId: null,
    agentId: null,
    attributionAgent: null,
    isSidechain: null,
    cwd: null,
    title: null,
    startedAt: null,
    capabilities: { ...EMPTY_CAPABILITIES },
  };

  const handle = await open(sourcePath, "r");
  try {
    const buffer = Buffer.alloc(maximumBytes);
    const { bytesRead } = await handle.read(buffer, 0, maximumBytes, 0);
    const text = buffer.subarray(0, bytesRead).toString("utf8");
    const lines = text.split("\n");

    if (bytesRead === maximumBytes) {
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

async function readCachedHeadEvidence(
  sourcePath: string,
  sourceSize: number,
  sourceMtimeMs: number,
  cache: ClaudeEvidenceCache,
  maximumBytes = HEAD_BYTES,
): Promise<HeadEvidence> {
  const cached = cache.get(sourcePath);
  if (cached?.sourceSize === sourceSize && cached.sourceMtimeMs === sourceMtimeMs) {
    return cached.evidence;
  }
  let evidence = await readHeadEvidence(sourcePath, maximumBytes);
  if (
    maximumBytes < HEAD_BYTES
    && sourceSize > maximumBytes
    && (!evidence.sessionId || !evidence.agentId || evidence.isSidechain === null)
  ) {
    evidence = await readHeadEvidence(sourcePath, HEAD_BYTES);
  }
  cache.set(sourcePath, { sourceSize, sourceMtimeMs, evidence });
  return evidence;
}

function fallbackProjectLabel(directoryName: string): string {
  const segments = directoryName.split("-").filter(Boolean);
  return segments.at(-1) ?? directoryName;
}

interface DiscoveredSubagent {
  agentId: string;
  evidence: HeadEvidence;
  sourcePath: string;
  sourceSize: number;
  sourceMtimeMs: number;
}

async function discoverSubagents(
  projectDirectory: string,
  sessionFileName: string,
  providerSessionId: string | null,
  cache: ClaudeEvidenceCache,
  seenPaths: Set<string>,
): Promise<DiscoveredSubagent[]> {
  if (!providerSessionId) return [];
  const sessionDirectoryName = sessionFileName.slice(0, -".jsonl".length);
  const subagentDirectory = join(projectDirectory, sessionDirectoryName, "subagents");
  let entries;
  try {
    entries = await readdir(subagentDirectory, { withFileTypes: true });
  } catch {
    return [];
  }

  const children: DiscoveredSubagent[] = [];
  for (const entry of entries) {
    const match = entry.isFile() ? entry.name.match(/^agent-([A-Za-z0-9_-]+)\.jsonl$/) : null;
    const pathAgentId = match?.[1];
    if (!pathAgentId) continue;
    const sourcePath = join(subagentDirectory, entry.name);
    try {
      const sourceStat = await stat(sourcePath);
      seenPaths.add(sourcePath);
      const evidence = await readCachedHeadEvidence(
        sourcePath,
        sourceStat.size,
        sourceStat.mtimeMs,
        cache,
        SUBAGENT_HEAD_BYTES,
      );
      if (
        evidence.sessionId !== providerSessionId
        || evidence.agentId !== pathAgentId
        || evidence.isSidechain !== true
      ) {
        continue;
      }
      children.push({
        agentId: pathAgentId,
        evidence,
        sourcePath,
        sourceSize: sourceStat.size,
        sourceMtimeMs: sourceStat.mtimeMs,
      });
    } catch {
      // A broken or actively replaced child file must not hide its parent session.
    }
  }
  return children;
}

export async function discoverClaudeTracks(
  sourceRoot: string,
  cache: ClaudeEvidenceCache = new Map(),
): Promise<Array<ProviderTrackDescriptor<ClaudeTrackReference>>> {
  const projectEntries = await readdir(sourceRoot, { withFileTypes: true });
  const tracks: Array<ProviderTrackDescriptor<ClaudeTrackReference>> = [];
  const seenPaths = new Set<string>();

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
        seenPaths.add(sourcePath);
        evidence = await readCachedHeadEvidence(
          sourcePath,
          sourceStat.size,
          sourceStat.mtimeMs,
          cache,
        );
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
      const subagents = await discoverSubagents(
        projectDirectory,
        sessionEntry.name,
        evidence.sessionId,
        cache,
        seenPaths,
      );
      const childTracksByAgentId = Object.fromEntries(subagents.map((child) => {
        const childTrackId = `${trackId}:agent:${child.agentId}`;
        return [child.agentId, {
          trackId: childTrackId,
          title: child.evidence.attributionAgent
            ? titleFromAgentAttribution(child.evidence.attributionAgent)
            : child.evidence.title || `Sub-agent ${child.agentId.slice(0, 8)}`,
        }];
      }));

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
        capabilities: {
          ...evidence.capabilities,
          subagents: evidence.capabilities.subagents || subagents.length > 0,
        },
      };

      tracks.push({
        summary,
        reference: {
          sourcePath,
          sourceSize: sourceStat.size,
          sourceMtimeMs: sourceStat.mtimeMs,
          sourceClass: "session",
          childTracksByAgentId,
        },
      });

      for (const child of subagents) {
        const childLink = childTracksByAgentId[child.agentId];
        if (!childLink) continue;
        const childUpdatedAt = new Date(child.sourceMtimeMs).toISOString();
        tracks.push({
          summary: {
            id: childLink.trackId,
            providerId: "claude-code",
            providerLabel: "Claude Code",
            projectId: `claude-project:${projectIdentity}`,
            projectLabel,
            title: childLink.title,
            startedAt: child.evidence.startedAt,
            updatedAt: childUpdatedAt,
            entryCount: null,
            sourceBytes: child.sourceSize,
            state: Date.now() - child.sourceMtimeMs <= RECENT_WINDOW_MS ? "recent" : "unknown",
            capabilities: child.evidence.capabilities,
            parentTrackId: trackId,
          },
          reference: {
            sourcePath: child.sourcePath,
            sourceSize: child.sourceSize,
            sourceMtimeMs: child.sourceMtimeMs,
            sourceClass: "subagent",
            parentTrackId: trackId,
            providerAgentId: child.agentId,
            childTracksByAgentId,
          },
        });
      }
    }
  }

  for (const cachedPath of cache.keys()) {
    if (!seenPaths.has(cachedPath)) cache.delete(cachedPath);
  }

  return tracks;
}
