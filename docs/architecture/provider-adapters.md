# Provider adapter contract

## Purpose

A provider adapter converts one CLI's session storage into Tracks' canonical session model. The contract must tolerate evolving provider schemas, partially written files, missing capabilities, and events with no canonical equivalent.

The adapter boundary is a data boundary, not a UI plugin boundary.

## Responsibilities

An adapter is responsible for:

- Identifying its provider and adapter version.
- Proposing likely source locations.
- Validating that a configured source belongs to the provider.
- Enumerating session references cheaply.
- Parsing a complete or incremental session.
- Mapping provider records to canonical entries and relations.
- Declaring capabilities and limitations.
- Preserving raw IDs, event kinds, source locations, and unknown payloads.
- Producing structured human-readable summaries for tool events.
- Reporting diagnostics without aborting unrelated sessions.

An adapter is not responsible for:

- Rendering React components.
- Styling events.
- Reading arbitrary filesystem locations.
- Owning the index database.
- Displaying notifications.
- Running provider commands.
- Uploading content.

## Package ownership and upgrade rule

Each provider package owns its manifest, source discovery, provider-format inventory, parser, normalization map, capability detection, diagnostics, sanitized fixtures, and conformance expectations. The first such package is `provider-claude-code`.

Provider format changes should normally require changes only inside that provider package plus its fixtures. Core model or shared UI changes are justified only when new evidence reveals a genuinely reusable semantic concept that cannot be represented by existing canonical facts, relations, artifacts, capabilities, extensions, or unsupported entries.

Installing or registering a later built-in adapter adds its package and manifest to the adapter registry. It must not require edits to the library, index orchestration, ordinary entry renderers, or navigation merely to accommodate different provider field names. Provider packages may update independently while their emitted adapter API and canonical schema versions remain compatible.

The current Claude package is grounded in [Claude Code provider evidence](../providers/claude-code.md). The external `claude-code-schema` project informs configuration/CLI version context but is not treated as a transcript schema.

## Contract sketch

This TypeScript sketch communicates the intended shape. Runtime schemas must validate the actual boundary.

~~~ts
export const TRACKS_ADAPTER_API_VERSION = 1;

export interface ProviderManifest {
  adapterApiVersion: number;
  providerId: string;
  displayName: string;
  adapterVersion: string;
  providerVersionRange?: string;
  capabilities: ProviderCapabilities;
}

export type CapabilityDeclaration =
  | "supported"
  | "unsupported"
  | "variable"
  | "unknown";

export interface ProviderCapabilities {
  liveUpdates: CapabilityDeclaration;
  incrementalParse: CapabilityDeclaration;
  reasoning: CapabilityDeclaration;
  tokenUsage: CapabilityDeclaration;
  cost: CapabilityDeclaration;
  fileDiffs: CapabilityDeclaration;
  subAgents: CapabilityDeclaration;
  stableEventIds: CapabilityDeclaration;
  rawPayloads: CapabilityDeclaration;
}

export interface ProviderAdapter {
  manifest: ProviderManifest;

  proposeSources(context: DiscoveryContext): Promise<SourceProposal[]>;
  validateSource(source: ConfiguredSource): Promise<SourceValidation>;
  scan(source: ConfiguredSource, cursor?: ScanCursor): AsyncIterable<ScanItem>;
  load(request: LoadTrackRequest): AsyncIterable<NormalizedTrackChunk>;
  loadIncremental?(
    request: IncrementalLoadRequest
  ): Promise<IncrementalTrackUpdate>;
  readRaw?(reference: RawReference): Promise<RawReadResult>;
}

export type NormalizedTrackChunk =
  | { kind: "metadata"; track: NormalizedTrackMetadata }
  | { kind: "entries"; entries: TrackEntry[] }
  | { kind: "relations"; relations: EntryRelation[] }
  | { kind: "artifacts"; artifacts: Artifact[] }
  | { kind: "diagnostics"; diagnostics: AdapterDiagnostic[] }
  | { kind: "complete"; sourceRevision: string; cursor?: string };

export type RawReadResult =
  | { state: "available"; value: UnknownJsonValue | string | Uint8Array }
  | { state: "redacted"; reason?: string }
  | { state: "stale"; reason?: string }
  | { state: "unavailable"; reason?: string };
~~~

The server supplies a restricted source-access object rather than allowing an external adapter to open arbitrary paths directly.

`load` is chunked even when the first Claude Code implementation could return a whole session comfortably. This prevents the complete logical track from becoming a required in-memory or wire payload and gives the indexer bounded points for validation, cancellation, backpressure, and transaction staging.

The metadata chunk appears first, entry/artifact/relation/diagnostic chunks are size bounded, and a complete chunk closes a successful load. The indexer may stage chunks transactionally and publishes a new revision only after validation succeeds.

## Source discovery

A source proposal contains:

- Provider ID.
- Proposed path or source URI.
- Reason for detection.
- Confidence: certain, likely, or possible.
- Whether explicit approval is required.
- Non-sensitive preview metadata.

Detection must be conservative. Tracks should not recursively scan the entire home directory looking for recognizable JSON.

The Claude adapter also must not treat every JSONL below the Claude configuration directory as a session. Project sessions, top-level prompt history, and plugin-owned JSONL are distinct source classes with separate inclusion policies.

Configured source IDs are Tracks-owned and stable. Paths are canonicalized with platform-aware rules, but the original display path is retained.

## Session scanning

Scanning should be metadata-first. A ScanItem contains enough information to decide whether the track needs parsing:

~~~ts
export interface ScanItem {
  providerSessionId?: string;
  sourceSessionKey: string;
  sourceRevision: string;
  titleHint?: string;
  projectHint?: string;
  startedAtHint?: string;
  updatedAtHint?: string;
  statusHint?: "running" | "complete" | "failed" | "unknown";
  loadReference: ProviderLoadReference;
}
~~~

sourceSessionKey is unique within a configured source. sourceRevision changes whenever meaningful source content may have changed. It may be a provider revision, file identity plus size/mtime, database sequence, or content hash.

The indexer, not the adapter, decides scheduling and concurrency.

## Loading and normalization

Normalized output contains:

- Track metadata.
- Ordered canonical entries.
- Relations between entries.
- Artifact references.
- Capability observations for this specific session.
- Parse diagnostics.
- Source cursor/revision for later incremental work.

Capabilities may differ per session even within one provider. For example, reasoning may be available in some model/session combinations and unavailable in others.

### Capability and availability levels

Capability is recorded at three levels:

1. The manifest declares an adapter-wide default: supported, unsupported, variable, or unknown.
2. Normalized track metadata records what was observed for this session: available, partial, unavailable, or unknown, with a safe reason when useful.
3. An entry or artifact records a more specific state when the distinction matters, such as provider-redacted reasoning, a truncated result, or raw evidence that became stale.

The adapter never fills an absent value with a plausible default. Optional data enriches canonical entries but cannot be required by shared components unless the entry kind defines it as part of its minimum valid shape.

## Provider terminology and Tracks semantics

Provider names are evidence, not the shared UI vocabulary. The Claude Code adapter maintains an explicit mapping table derived from sanitized fixtures:

| Provider evidence | Canonical interpretation | Preserved detail |
| --- | --- | --- |
| Human-authored content record | User message | Exact provider record kind and ID |
| Assistant content record | Assistant message and its content blocks | Model/usage fields when actually present |
| Claude tool invocation record | Tool call with a canonical category | Exact Claude tool name, call ID, and arguments |
| Claude tool response record | Tool result related by call ID | Exact outcome, content, and truncation evidence |
| Provider status or compaction record | Status, diagnostic, or unsupported entry according to meaning | Original record kind and raw evidence reference |
| Unknown valid Claude record | Unsupported entry | Original kind, source location, and evidence availability |

The concrete provider field names and versions belong in a Claude Code format inventory, not in this provider-neutral contract. Future Codex or Grok CLI adapters create their own evidence-based maps. Similar spelling does not prove equivalent meaning, and different spelling does not prevent a canonical mapping when behavior is equivalent.

### Primitive facts and derived presentations

Adapters emit the closest non-duplicated canonical facts supported by provider evidence. They must not emit both a generic tool event and a command/file-change event for the same semantic fact merely to obtain two renderers.

- A provider-native call/result pair normally remains `ToolCallEntry` plus `ToolResultEntry`, with a canonical category such as `command` or `file-change`.
- A provider-native process or file-change record may map directly to `CommandEntry` or `FileChangeEntry` when that is the provider's actual semantic unit.
- The view-model layer may turn either representation into the same shared `CommandView` or `FileChangeView`.
- If distinct records provide distinct evidence—for example, a tool result followed by a separately recorded patch—both may remain, connected by relations and deduplicated in aggregate counts where appropriate.

This rule keeps chronology faithful while allowing the UI to offer specialized presentation without provider-name branches.

## Event mapping rules

### Preserve chronology

Emit entries in provider order and record provider sequence evidence. Do not reorder events merely to create a nicer UI. The UI projection may group related tool call/result events while retaining underlying chronology.

### Preserve identity

Use stable provider event IDs when available. Otherwise derive a deterministic ID from source session key, record position, provider event kind, and stable content evidence. Do not use a random UUID on each parse.

### Preserve unknowns

When a record is valid provider data but has no canonical mapping, emit an UnsupportedEntry containing:

- Provider event kind.
- Timestamp/sequence when known.
- Safe summary.
- Raw evidence state: available reference, redacted, stale, or unavailable.
- Diagnostic code.

Never drop unknown records silently.

### Separate absence from failure

These are different:

- Provider does not support reasoning.
- This session does not contain reasoning.
- Reasoning is redacted/unavailable.
- Adapter failed to parse reasoning.
- Tracks policy hides reasoning.

Adapters emit evidence; policy and presentation are handled later.

### Avoid lossy summaries

Tool summaries should be structured:

~~~ts
export interface ToolSummary {
  verb?: string;
  object?: string;
  path?: string;
  line?: number;
  count?: number;
  commandPreview?: string;
  providerLabel?: string;
}
~~~

The UI constructs localized human-readable text from fields and falls back to providerLabel only when necessary.

### Raw payloads

Prefer a RawReference over copying large raw JSON into every entry:

~~~ts
export interface RawReference {
  sourceId: string;
  sourceSessionKey: string;
  sourceRevision: string;
  locator:
    | { kind: "byte-range"; path: string; start: number; end: number }
    | { kind: "record"; path: string; recordKey: string }
    | { kind: "database-row"; database: string; table: string; key: string }
    | { kind: "cached"; cacheKey: string };
  mediaType?: string;
  expectedSha256?: string;
}
~~~

The server enforces source policy again when resolving this reference.

A raw reference is valid only against its recorded source revision or expected content hash. If the provider rewrites, compacts, moves, or replaces the source and the locator can no longer be verified, raw retrieval returns an explicit stale/unavailable result; it must never return different bytes as if they were the original evidence. Tracks may use a bounded cache to retain selected evidence across rewrites, but caching is not the default for all payloads.

## Partial and streaming input

Providers may append incomplete JSON/JSONL records, rewrite files, compact history, or stream separate tool-result updates.

Adapters must:

- Return complete entries parsed before an incomplete tail.
- Emit a partial diagnostic for the tail rather than a permanent error.
- Include a safe resume cursor when supported.
- Reconcile a previously partial event when it becomes complete.
- Signal whether an update is append-only or requires a replacement range/full reparse.

Incremental output should use one of:

~~~ts
export type IncrementalTrackUpdate =
  | { kind: "append"; afterEntryId?: string; entries: TrackEntry[]; cursor: string }
  | { kind: "replace"; fromEntryId: string; toEntryId?: string; entries: TrackEntry[]; cursor: string }
  | { kind: "reparse-required"; reason: string };
~~~

The indexer validates identity and ordering before committing.

## Diagnostics

Diagnostics are structured and stable:

~~~ts
export interface AdapterDiagnostic {
  code: string;
  severity: "info" | "warning" | "error";
  scope: "source" | "track" | "entry";
  message: string;
  recoverability: "none" | "retry" | "reparse" | "upgrade-adapter";
  sourceLocation?: SourceLocation;
  providerEventKind?: string;
  rawReference?: RawReference;
}
~~~

Messages are safe for local display and must not embed full sensitive payloads. Detailed evidence is referenced separately.

## Provider tool taxonomy

Adapters map provider tools to a small canonical category while retaining exact provider name:

| Canonical category | Examples |
| --- | --- |
| file-read | Read file, list directory |
| file-search | Glob, grep, semantic search |
| command | Shell/process execution |
| file-change | Edit, write, patch, delete, rename |
| web | Search or fetch network resource |
| task | Sub-agent, delegated task, plan execution |
| interaction | Ask user, approval, prompt |
| external | MCP/plugin/service tool |
| generic | Valid tool without a narrower mapping |

Categories drive common iconography and renderer selection. Exact providerToolName remains visible in detail.

## Conformance test kit

Every adapter must pass shared tests for:

- Deterministic scan and load results.
- Stable track and entry identity.
- Chronological ordering.
- Capability declaration.
- Unknown event preservation.
- Malformed record isolation.
- Partial-tail recovery.
- Raw-reference confinement.
- Large payload behavior.
- Path normalization across supported platforms.
- Sanitized diagnostic messages.
- Round-trip runtime schema validation.

Each adapter also maintains sanitized fixtures for:

- Small complete session.
- Active/partial session.
- Tool call with result.
- Command success and failure.
- File changes.
- Provider-specific unknown event.
- Malformed record.
- Largest realistically encountered payload shape.

## External adapter model

Do not expose in-process third-party adapters until the contract is proven by at least two built-in providers.

If external adapters are introduced:

- Install from explicit user action.
- Display publisher, version, requested filesystem grants, and trust status.
- Run as a subprocess or restricted worker.
- Communicate using versioned JSON-RPC or an equivalent schema-validated protocol.
- Grant access only to assigned sources.
- Set CPU, memory, output-size, and timeout limits.
- Never allow an adapter to send UI code or bypass sanitization.
- Make outbound network permission explicit and off by default.

An adapter can enrich data through structured fields and capabilities; it cannot redefine Tracks' interaction model.
