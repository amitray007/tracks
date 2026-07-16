# Canonical session model

## Goals

The canonical model gives the UI one stable vocabulary while preserving provider evidence and uncertainty.

It must:

- Represent the concepts shared by coding-agent CLIs.
- Retain provider-specific IDs, kinds, metadata, and raw references.
- Tolerate missing timestamps and capabilities.
- Preserve chronological and causal relationships.
- Be versioned and runtime-validatable.
- Support incremental updates and stable deep links.
- Avoid encoding Claude Code-specific names as universal concepts.

The first schema is derived from Claude Code fixtures. Other providers influence boundary design, but their fields and terminology are not modeled speculatively. When a future adapter cannot provide a Claude-rich field, the canonical entry remains valid at its minimum shape and the unavailable enrichment is represented explicitly where the distinction matters.

## Modeling layers and optionality

The canonical model contains provider-neutral facts, not ready-to-render components and not a union of every provider's raw schema. Data is divided into three layers:

1. **Canonical facts** used by shared search, navigation, relationships, and renderers.
2. **Provider evidence** containing original names, IDs, locations, bounded extensions, and revision-safe raw references.
3. **Derived view models** that combine facts for presentation without becoming source truth.

Every entry kind defines a minimum valid shape. Optional fields are enrichment. Shared UI must render the minimum shape and must not infer a value merely because another adapter normally supplies it.

An absent optional scalar means “not supplied; no stronger claim.” When the user must understand why data is absent, the model uses an explicit capability, evidence, truncation, redaction, or diagnostic state. This avoids wrapping every optional string in an availability object while still distinguishing important cases.

## Foundational scalar types

Branded IDs prevent accidental mixing in TypeScript while remaining strings on the wire:

~~~ts
export type TrackId = string & { readonly __brand: "TrackId" };
export type EntryId = string & { readonly __brand: "EntryId" };
export type ArtifactId = string & { readonly __brand: "ArtifactId" };
export type Timestamp = string; // RFC 3339 on the API boundary

export type DataAvailability =
  | { state: "available" }
  | { state: "partial"; reason?: string }
  | { state: "unavailable"; reason?: string }
  | { state: "redacted"; reason?: string }
  | { state: "stale"; reason?: string }
  | { state: "unknown" };

export type UnknownJsonValue =
  | null
  | boolean
  | number
  | string
  | UnknownJsonValue[]
  | { [key: string]: UnknownJsonValue };

export type TrackEntryKind =
  | "user-message"
  | "assistant-message"
  | "system-message"
  | "reasoning"
  | "tool-call"
  | "tool-result"
  | "command"
  | "file-change"
  | "sub-agent"
  | "status"
  | "error"
  | "unsupported";
~~~

## Top-level track

~~~ts
export interface Track {
  schemaVersion: 1;
  id: TrackId;
  provider: ProviderIdentity;
  source: TrackSource;
  providerSessionId?: string;

  title: DerivedValue<string>;
  project?: ProjectIdentity;
  model?: ModelIdentity;
  startedAt?: Timestamp;
  endedAt?: Timestamp;
  status: TrackStatus;

  capabilities: TrackCapabilities;
  stats: TrackStats;
  entries: TrackEntry[];
  relations: EntryRelation[];
  artifacts: Artifact[];
  diagnostics: TrackDiagnostic[];

  sourceRevision: string;
  indexedAt: Timestamp;
}

export type TrackStatus =
  | "running"
  | "complete"
  | "failed"
  | "cancelled"
  | "partial"
  | "unknown";
~~~

`Track` is the complete logical aggregate used by schemas, fixtures, and tests. It is not the required ingestion or API response shape. Production ingestion uses bounded chunks, and production queries return track metadata plus cursor/anchor-based entry and artifact slices.

DerivedValue distinguishes provider facts from Tracks-generated metadata:

~~~ts
export interface DerivedValue<T> {
  value: T;
  origin: "provider" | "tracks-derived" | "user";
  confidence?: "high" | "medium" | "low";
}
~~~

A user alias may override the displayed title without erasing provider or derived values in storage.

## Provider and source identity

~~~ts
export interface ProviderIdentity {
  id: string;
  displayName: string;
  adapterVersion: string;
  providerVersion?: string;
}

export interface TrackSource {
  sourceId: string;
  sourceSessionKey: string;
  displayLocation?: string;
  canonicalLocationHash?: string;
  rawEvidence: DataAvailability;
}
~~~

The normal API may return a redacted displayLocation. Internal canonical paths remain in the server's policy-controlled source registry.

## Entry base

~~~ts
export interface EntryBase {
  id: EntryId;
  kind: TrackEntryKind;
  sequence: number;
  timestamp?: Timestamp;
  durationMs?: number;
  status?: EntryStatus;

  parentEntryId?: EntryId;
  providerEventId?: string;
  providerEventKind?: string;
  sourceLocation?: SourceLocation;
  rawEvidence?: RawEvidence;

  visibility?: "normal" | "sensitive" | "redacted";
  diagnostics?: EntryDiagnostic[];
  extensions?: Record<string, UnknownJsonValue>;
}

export type RawEvidence =
  | { state: "available"; reference: RawReference }
  | { state: "redacted"; reason?: string }
  | { state: "stale"; reason?: string }
  | { state: "unavailable"; reason?: string }
  | { state: "unknown" };

export type EntryStatus =
  | "waiting"
  | "running"
  | "complete"
  | "failed"
  | "cancelled"
  | "partial"
  | "unknown";
~~~

sequence is the deterministic canonical order and is always present. timestamp is optional because provider records may omit it or disagree.

## Entry union

~~~ts
export type TrackEntry =
  | UserMessageEntry
  | AssistantMessageEntry
  | SystemMessageEntry
  | ReasoningEntry
  | ToolCallEntry
  | ToolResultEntry
  | CommandEntry
  | FileChangeEntry
  | SubAgentEntry
  | StatusEntry
  | ErrorEntry
  | UnsupportedEntry;
~~~

### Messages

~~~ts
export interface UserMessageEntry extends EntryBase {
  kind: "user-message";
  content: ContentBlock[];
}

export interface AssistantMessageEntry extends EntryBase {
  kind: "assistant-message";
  content: ContentBlock[];
  model?: ModelIdentity;
  usage?: Usage;
}

export interface SystemMessageEntry extends EntryBase {
  kind: "system-message";
  content: ContentBlock[];
  category?: "provider" | "policy" | "environment" | "notice";
}
~~~

ContentBlock is a controlled union, not arbitrary HTML:

~~~ts
export type ContentBlock =
  | { type: "text"; text: string; format: "plain" | "markdown" }
  | { type: "code"; code: string; language?: string; filename?: string }
  | { type: "image-reference"; artifactId: ArtifactId; alt?: string }
  | { type: "structured"; value: UnknownJsonValue }
  | { type: "redacted"; reason?: string }
  | { type: "unsupported"; mediaType?: string; rawEvidence?: RawEvidence };
~~~

Inline content is size bounded by schema/runtime policy. Oversized text, structured values, images, diffs, and binary content move to an `Artifact` with a bounded preview. A normal entry payload must remain cheap enough to validate, index, paginate, and render even when the referenced body is enormous.

### Reasoning

~~~ts
export interface ReasoningEntry extends EntryBase {
  kind: "reasoning";
  availability: "full" | "summary" | "unavailable" | "redacted";
  content?: ContentBlock[];
  summary?: string;
  policyReason?: string;
}
~~~

The model never implies that unavailable reasoning exists in a retrievable form.

### Tools

~~~ts
export interface ToolCallEntry extends EntryBase {
  kind: "tool-call";
  callId: string;
  category: ToolCategory;
  providerToolName: string;
  summary: ToolSummary;
  arguments?: UnknownJsonValue;
}

export interface ToolResultEntry extends EntryBase {
  kind: "tool-result";
  callId: string;
  outcome: "success" | "failure" | "cancelled" | "unknown";
  content: ContentBlock[];
  truncatedBy?: "provider" | "tracks";
}
~~~

Tool calls and results remain separate chronological entries. A view-model projection may combine them into one expandable ToolInvocation while maintaining links to both IDs.

Provider terminology does not affect this distinction. An adapter maps provider-native invocation and response concepts by meaning, while `providerToolName`, `providerEventKind`, and raw evidence retain Claude Code's exact vocabulary.

### Commands

~~~ts
export interface CommandEntry extends EntryBase {
  kind: "command";
  callId?: string;
  providerToolName?: string;
  command: string;
  cwd?: string;
  shell?: string;
  stdout?: TextArtifactReference;
  stderr?: TextArtifactReference;
  exitCode?: number;
  signal?: string;
  truncatedBy?: "provider" | "tracks";
}
~~~

An adapter may emit CommandEntry when the provider meaning is unambiguously process execution. It retains the underlying provider tool name and raw reference. Generic execution-like tools remain tool events.

### File changes

~~~ts
export interface FileChangeEntry extends EntryBase {
  kind: "file-change";
  operation: "create" | "modify" | "delete" | "rename" | "unknown";
  path: string;
  previousPath?: string;
  language?: string;
  additions?: number;
  deletions?: number;
  binary?: boolean;
  patchArtifactId?: ArtifactId;
  beforeArtifactId?: ArtifactId;
  afterArtifactId?: ArtifactId;
  evidence: "provider-patch" | "provider-snapshots" | "tracks-computed";
}
~~~

Tracks must label computed diffs so they are not mistaken for provider-supplied evidence.

### Sub-agents

~~~ts
export interface SubAgentEntry extends EntryBase {
  kind: "sub-agent";
  childTrackId?: TrackId;
  childProviderSessionId?: string;
  label?: string;
  objective?: string;
}
~~~

Inline provider event trees and separately stored child sessions can both map to this relation.

### Status, errors, and unsupported events

~~~ts
export interface StatusEntry extends EntryBase {
  kind: "status";
  category: "lifecycle" | "approval" | "compaction" | "limit" | "provider";
  message: string;
}

export interface ErrorEntry extends EntryBase {
  kind: "error";
  category: "provider" | "tool" | "parse" | "source" | "render";
  code?: string;
  message: string;
  recoverability?: "none" | "retry" | "reparse" | "upgrade-adapter";
}

export interface UnsupportedEntry extends EntryBase {
  kind: "unsupported";
  summary: string;
  rawEvidence: RawEvidence;
}
~~~

An unsupported entry is still valid when raw bytes are unavailable, redacted, or stale. The UI shows that evidence state rather than dropping the entry or presenting a broken disclosure.

## Relations

Relations express causality without requiring all events to be nested physically:

~~~ts
export interface EntryRelation {
  type:
    | "responds-to"
    | "tool-call-result"
    | "caused"
    | "parent-child"
    | "supersedes"
    | "same-artifact";
  fromEntryId: EntryId;
  toEntryId: EntryId;
}
~~~

Examples:

- Assistant message caused a tool call.
- Tool result corresponds to a call.
- File change was caused by a tool result.
- A completed partial entry supersedes its earlier representation.
- Sub-agent boundary points to child work.

## Artifacts

Artifacts keep potentially large content out of ordinary entry payloads:

~~~ts
export interface Artifact {
  id: ArtifactId;
  kind: "text" | "code" | "diff" | "file" | "image" | "structured" | "binary";
  mediaType?: string;
  byteLength?: number;
  sha256?: string;
  source: ArtifactSource;
  preview?: string;
  truncatedBy?: "provider" | "tracks";
}
~~~

ArtifactSource may reference an allowed provider byte range, Tracks cache, generated diff, or explicitly imported local file. Retrieval is policy checked and size bounded.

## Capabilities

Provider capabilities are defaults; track capabilities record observed reality:

~~~ts
export interface TrackCapabilities {
  liveUpdates: CapabilityState;
  reasoning: CapabilityState;
  usage: CapabilityState;
  cost: CapabilityState;
  fileDiffs: CapabilityState;
  subAgents: CapabilityState;
  rawPayloads: CapabilityState;
}

export type CapabilityState =
  | { state: "available" }
  | { state: "partial"; reason?: string }
  | { state: "unavailable"; reason?: string }
  | { state: "unknown" };
~~~

UI controls are driven by capability state, not provider-name conditionals.

## Identity rules

### Track ID

Prefer a provider-stable session ID scoped by provider and configured source. Otherwise derive from provider ID, stable source ID, and sourceSessionKey.

### Entry ID

Preference order:

1. Stable provider event ID.
2. Stable provider record key.
3. Deterministic hash of track ID, provider kind, source locator, and stable content evidence.

Reparsing unchanged content must reproduce IDs. Do not include mutable display titles, current file modification time alone, or array index alone.

### Artifact ID

Use a content hash when content is available and safe. Otherwise derive from track ID plus stable source locator and artifact role.

## Ordering and time

- sequence is authoritative for display order.
- timestamp is evidence and may be missing or non-monotonic.
- Preserve provider timestamp precision and timezone/offset where supplied.
- Derive duration only when start/end evidence is compatible.
- Never reorder non-monotonic events silently by timestamp.
- The inspector can expose provider sequence and timestamp anomalies.

## Extension fields

extensions retains small provider-specific structured metadata under a namespaced key:

~~~ts
extensions: {
  "claude-code": { /* validated provider extension */ },
  "codex": { /* validated provider extension */ }
}
~~~

Extensions must be JSON-compatible, size bounded, and optional for the core UI. Large or sensitive provider data uses RawReference.

## Presentation projections

Compact and full views are not separate stored session models:

- **Full view** renders canonical entries in deterministic sequence, subject only to explicit user filters and within-entry disclosure.
- **Compact view** derives deterministic groups/summaries from entry kinds, relations, statuses, artifact previews, and configured collapse thresholds.
- Every compact group records its member entry IDs and a primary full-view anchor.
- Errors, unsupported records, partial data, redaction, and stale evidence remain visibly represented in compact mode.
- Provider-generated or Tracks-generated titles/summaries retain provenance; compact mode does not silently ask a remote model to reinterpret the session.
- Share bundles may persist the generated compact projection for speed, but the projection is versioned, reproducible from exported canonical facts, and never replaces them.

Presentation projection versions are independent from provider schemas. Changing grouping/collapse behavior does not require rewriting provider source or pretending canonical evidence changed.

## Schema evolution

- Increment schemaVersion only for canonical breaking changes.
- Runtime validators support the current version and explicit migrations from supported older versions.
- Indexed canonical data can be discarded and rebuilt from provider sources.
- User-owned aliases, tags, notes, and settings live in separate tables and migrate independently.
- API responses include both canonical schema version and API version.
- Adapter API version is independent from the canonical schema version.

## Normalization invariants

1. Every track and entry has a stable Tracks ID.
2. Every entry has deterministic sequence.
3. Provider event kind and identity are retained when available.
4. Unsupported valid provider records remain visible.
5. Raw provider data is referenced, not trusted or rendered directly.
6. Truncation, redaction, unavailability, and failure are distinct states.
7. Provider and Tracks-derived values are distinguishable.
8. Large data moves through artifacts and on-demand retrieval.
9. Capability state drives features instead of provider-name branching.
10. All normalized values pass runtime validation before indexing or UI delivery.
11. Every entry renders from a documented minimum shape; optional enrichment may be absent without invalidating it.
12. Provider terminology is retained as evidence but does not become shared component terminology.
13. One provider fact is not duplicated into multiple canonical entry kinds merely to select a specialized renderer.
14. Raw evidence is revision checked and may become explicitly stale or unavailable.
15. The complete logical track can be ingested, queried, and rendered in bounded slices.
