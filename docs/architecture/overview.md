# System architecture

## Architectural objective

Tracks must ingest several evolving provider formats while presenting one stable, high-quality reading experience. The architecture therefore places a strict normalization boundary between provider-owned source data and the UI.

The UI never parses Claude Code, Codex, or Grok CLI files. Provider adapters never control shared visual structure.

The current implementation target is Claude Code only. Codex, Grok CLI, and other providers are architectural test cases for the boundary, not parallel implementation commitments. Canonical concepts must be justified by Claude Code evidence now and revised later when a second provider supplies contrary evidence; Tracks should not invent speculative provider fields merely to make the model look universal.

Provider asymmetry is expected. One provider may expose reasoning, usage, diffs, sub-agents, or stable event IDs while another exposes only messages and coarse tool records. The UI therefore depends on canonical facts plus explicit capability and availability state, never on an assumption that every adapter can populate the richest shape.

## System context

~~~mermaid
flowchart LR
    CC["Claude Code files"] --> CCA["Claude Code adapter"]
    CX["Later: Codex files/database"] --> CXA["Later: Codex adapter"]
    GK["Later: Grok CLI source"] --> GKA["Later: Grok adapter"]
    FP["Future provider"] --> FPA["Future adapter"]

    CCA --> N["Canonical session model"]
    CXA --> N
    GKA --> N
    FPA --> N

    N --> IDX["Local index and FTS"]
    N --> RAW["Raw evidence store/references"]
    IDX --> API["Local query API"]
    RAW --> API
    API --> UI["Local Tracks web UI"]
    UI --> EXP["Sanitized static share bundle"]
    EXP -. explicit later publish .-> HOST["User-chosen static/managed host"]
    API -. optional outbound device connection .-> RELAY["Tracks Server relay"]
    RELAY --> OWNER["Authenticated server web"]
    RELAY --> LIVE["Scoped live-share viewer"]
~~~

## Runtime shape

The recommended first implementation is a CLI-launched local process that owns source access, parsing, indexing, and an HTTP/live-update API. Running `tracks` starts or reuses that service and opens the React web UI on localhost. The CLI is the lifecycle boundary; the web UI owns the everyday product workflow.

    tracks process
    ├── CLI lifecycle, lock, status, doctor, browser launch
    ├── source registry
    ├── provider adapter registry
    ├── scanner and file watcher
    ├── parser/normalizer workers
    ├── SQLite metadata + FTS index
    ├── local HTTP and live-update API
    ├── static share exporter + loopback preview host
    └── static web application

Benefits:

- Browser code never receives unrestricted filesystem access.
- Source allowlists and redaction have one enforcement point.
- Expensive parsing/highlighting can move to workers.
- The web UI remains portable and testable.
- Users do not manage ports or start separate frontend/backend services in the installed product.
- Session/project sharing reuses the normalized model and renderers without granting a publisher direct source access.
- A later desktop wrapper can reuse the same local service.

An optional connection module in the same local agent may open an outbound WebSocket to Tracks Server. That server exposes an authenticated online-device dashboard and later routes bounded session requests to an online device. It is not a second index and does not persist session payloads. Local viewing remains accountless and independent of this connection.

See [CLI and local runtime](cli-runtime.md) for lifecycle and Portless development rules, [Sharing and hosting](sharing-hosting.md) for static export, and [Live sharing and hosted server](live-sharing.md) for the device relay and server web boundary.

## Normalization layers

Tracks owns a small semantic ecosystem between provider storage and UI components:

~~~mermaid
flowchart LR
    P["Provider records and terminology"] --> A["Claude Code adapter"]
    A --> C["Canonical facts, capabilities, and evidence references"]
    C --> V["Deterministic UI view models"]
    V --> U["Shared resilient components"]

    C --> X["Provider extensions and unsupported entries"]
    X --> V
~~~

Each layer has a distinct responsibility:

- **Provider records** retain Claude Code's actual names, identifiers, ordering, and storage behavior.
- **The adapter** maps provider meaning into canonical entries. It preserves the original provider term and emits unsupported evidence when a safe mapping is not justified.
- **The canonical model** describes facts such as a message, invocation, result, process execution, file change, status, or error. It also describes what is unavailable, partial, redacted, or unknown.
- **Activity facets** add orthogonal, provider-neutral meaning without duplicating chronology. Claude Code Skills, MCP, Channels, Hooks, memory access, and interactive commands remain messages/tools/results/status entries while carrying a bounded activity kind, label, operation, and minimal structured metadata.
- **View models** combine related canonical facts for presentation, such as a tool call and later result, without changing source chronology.
- **Components** render minimum valid data first and progressively add optional metadata. They do not branch on `providerId`.

Terminology differences are therefore adapter concerns. Claude Code's current vocabulary informs the first mappings, while future adapters map their own vocabulary into the same semantic concepts only where the evidence is equivalent. The exact provider event kind remains visible in inspection mode.

## Technology choices

The table separates the implemented Claude foundation from later candidates so the overview does not present exploratory dependencies as shipped architecture:

| Area | Current foundation or direction | Reason |
| --- | --- | --- |
| UI | React + TypeScript + Vite | Fast localhost workflow without requiring server rendering |
| Product entry point | `tracks` CLI | Own service lifecycle, source/index authority, browser launch, status, and diagnostics |
| Development routing | Pinned Portless | Stable same-origin `.localhost` URL and collision-free development ports; development only |
| Styling | Semantic CSS variables and component CSS | Small current surface, explicit density control, and no runtime styling dependency |
| Primitives | Native HTML controls today; Radix remains a candidate for focus-managed overlays | Preserve accessible semantics without adding abstractions before they are needed |
| Icons | Semantic `Icon` registry backed initially by `@hugeicons/react` and `@hugeicons/core-free-icons` | A richer provider-neutral glyph set without coupling shared components to a vendor package |
| Provider marks | Static tree-independent assets from Lobe Icons | Claude identity is visually distinct from provider-neutral event icons |
| Markdown | `react-markdown` plus GFM with raw HTML disabled | Safe current transcript rendering; streaming-specific parsing can be evaluated later |
| Diagrams | Lazy Mermaid and Viz.js renderers in a scriptless, network-blocked SVG sandbox | Covers observed Mermaid and Graphviz/DOT fences while preserving safe source fallbacks |
| Highlighting | Lazy-loaded `prism-react-renderer` | Syntax color without blocking the initial session-library bundle |
| Diffs | Purpose-built split renderer for Claude edit/write evidence | Correct `+`/`−`, line gutters, responsive stacking, and syntax-aware old/new panes |
| Virtualization | Candidate: `@tanstack/react-virtual` | Needed after measuring very long complete traces and scroll anchoring |
| Local storage | SQLite with FTS5 | Rebuildable metadata and full-text search index |
| Live updates | Recursive file watcher plus server-sent events | One-way source invalidation, native browser reconnect, and no bidirectional socket protocol |
| Hosted connection | Versioned, schema-validated WebSocket control protocol | Outbound device presence and later bounded request routing without exposing the loopback API |
| Server dashboard | Small server-owned web shell plus authenticated SSE presence | Keeps the hosted surface independent from local filesystem authority while sharing product semantics |
| Validation | TypeScript plus a runtime schema library | Boundary validation for provider and API data |
| Sharing | Generated static site/package | Offline-capable session/project viewing on ordinary static hosting |

The server/runtime language should be chosen after validating Claude Code parsing, file watching, packaging, and cross-platform distribution. TypeScript offers shared types; another systems language may offer packaging advantages. The provider contract should not depend on that choice.

## Suggested repository structure

    apps/
      web/                      React interface
      cli/                      installed entry point, service lifecycle, browser launch
      server/                   local API, source access, index orchestration
      cloud/                    hosted relay, device dashboard, live-share entry surface
    packages/
      core-model/               canonical session types and validation
      live-protocol/            bounded versioned device/server control schemas
      provider-sdk/             adapter contract and conformance kit
      provider-claude-code/     first built-in adapter
      provider-codex/           later built-in adapter
      indexer/                  SQLite schema, FTS, migrations
      renderers/                shared Markdown/code/diff view models
      share-exporter/           deterministic session/project static bundles
      publisher-sdk/            restricted approved-bundle publishing contract
      ui/                       design-system components
      fixtures/                 sanitized cross-provider test sessions
    docs/

Provider packages depend on core-model and provider-sdk. They must not depend on UI packages.

`apps/cloud` must not depend on provider adapters, source discovery, or the local index. It can route only capabilities and bounded projections defined by the live protocol. That dependency direction makes accidental hosted ingestion structurally difficult.

## Data flow

~~~mermaid
sequenceDiagram
    participant FS as Provider source
    participant AD as Adapter
    participant IX as Indexer
    participant DB as SQLite/FTS
    participant API as Local API
    participant UI as Web UI

    FS->>AD: detect/scan source
    AD->>AD: parse and normalize
    AD->>IX: track metadata + canonical entries
    IX->>DB: transactional upsert
    DB-->>API: query library/track slices
    API-->>UI: normalized view models
    FS-->>AD: file change
    AD->>IX: incremental entries or replacement range
    IX-->>API: change notification
    API-->>UI: session/entry delta
~~~

### Discovery

1. Built-in adapters propose provider sources from known paths.
2. The user approves or adds paths.
3. The source registry canonicalizes paths and records access policy.
4. Each adapter scans only sources assigned to it.

### Ingestion

1. An adapter enumerates lightweight session references.
2. The indexer compares source revision/cursor with indexed state.
3. Changed sessions are parsed into canonical tracks and entries.
4. Runtime validation rejects malformed normalized output at the boundary.
5. Metadata and searchable text are committed transactionally.
6. Raw provider data remains referenced by source location or stored in an explicitly bounded cache.

Normalization is allowed to be richer or poorer per session. A missing optional value is not synthesized. When absence affects user understanding, the adapter emits an explicit capability state or diagnostic so the UI can distinguish unsupported, absent, redacted, partial, and failed data.

Activity facets are derived during bounded parsing and are not a second persisted transcript. The local source remains authoritative; the derived index may store the facet and policy-approved searchable labels, while hook output, channel attributes, skill bodies, memory contents, and raw MCP payloads remain source-referenced or explicitly bounded. Static sharing applies its normal redaction policy before any activity metadata enters a bundle.

### Query

The UI requests projections rather than loading an entire track:

- Library pages and facets.
- Entry ranges around an anchor.
- Search hits and snippets.
- Entry detail/raw payload on demand.
- Changed-file summaries.
- Provider/source health.

This keeps the UI responsive and prevents giant raw payloads from crossing the API until requested.

The logical `Track` model is not the default transport unit. Adapters ingest entries in bounded batches, the index stores bounded projections, and APIs return cursor- or anchor-based slices. Small tracks may happen to fit in one response, but no component or endpoint relies on that being true.

### Live update

Adapters may provide file watching or polling hints, but the server owns watcher lifecycle and debouncing. A changed source triggers incremental parsing when supported and a safe session reparse otherwise.

The update protocol should express:

- Track metadata changed.
- Entries appended.
- A known range was replaced.
- Track was reparsed.
- Source or parse health changed.

The UI reconciles updates using stable track and entry IDs. It follows the live tail only when the user has opted in or is already at the tail.

Source activity and provider process liveness are separate. File changes may establish a live/recently-active state, but the UI reports `running` only when provider lifecycle evidence or an independently validated process integration supports it.

## Storage model

SQLite is a derived index, not the source of truth. Provider sources remain authoritative.

Suggested logical tables:

- sources
- provider_schema_observations
- tracks
- track_capabilities
- entries
- entry_relations
- artifacts
- changed_files
- parse_diagnostics
- track_text_fts
- user_annotations/settings

Canonical structured payloads may be stored as versioned JSON initially, with frequently queried fields normalized into columns. Raw provider payloads should preferably be read on demand by source reference; any cached raw content must have size, retention, and redaction policies.

User-owned data such as aliases, tags, and redaction settings is not derived and must survive index rebuilds.

### Data ownership and persistence boundary

Tracks distinguishes authoritative source data, rebuildable derived data, bounded cache data, durable user-owned data, and ephemeral UI data:

| Class | Examples | Default policy |
| --- | --- | --- |
| Provider-authoritative | Claude Code session files and provider attachments | Read in place; never modify or duplicate wholesale |
| Rebuildable derived index | Track metadata, canonical entry envelopes, searchable text, capabilities, counts, diagnostics | Store locally when needed for navigation/search; delete and rebuild safely |
| Bounded cache | Resolved raw payload fragments, highlighted code, generated diff previews | Avoid unless measurement justifies it; size/retention bounded and disposable |
| User-owned | Source approvals, aliases, tags, notes, preferences, redaction rules | Store separately and preserve across index rebuilds |
| Ephemeral | Open disclosures, selection, transient partial tails, render state | Keep in memory or URL state; do not persist by default |

The default implementation stores enough normalized data to make the library, filters, deep links, and search fast; it does not create a second permanent copy of every provider payload. Large output remains an artifact or raw reference and is resolved on demand. Rendered HTML, unsanitized provider markup, remote assets, and temporary streaming fragments are never persisted as trusted content.

Redaction and indexing policy are evaluated before searchable text is written. Changing a rule that affects indexed content marks the derived index for rebuild. Database files, journals, temporary files, and caches follow the same content policy and local file-permission requirements as the main index.

## API boundary

The local API should expose stable resource concepts:

- GET /api/providers
- GET /api/sources
- GET /api/tracks
- GET /api/tracks/:trackId
- GET /api/tracks/:trackId/entries
- GET /api/tracks/:trackId/search
- GET /api/entries/:entryId
- GET /api/entries/:entryId/raw
- GET /api/artifacts/:artifactId
- POST /api/sources/:sourceId/rescan
- POST /api/exports/preview
- POST /api/exports
- GET /api/exports/:exportId
- GET /api/events for live updates

Exact routes may change, but four rules are important:

1. Every response has a schema version.
2. Raw provider data is a separate, explicit request.
3. Pagination is anchor/cursor based, not fragile page-number based.
4. Filesystem paths and content are returned only when policy permits.
5. Export generation receives an explicit session/project selection and redaction policy; it never exports the entire index implicitly.

## View-model layer

Canonical entries represent data truth. UI view models may combine related events for presentation:

- Tool call plus later tool result becomes one ToolInvocation view.
- Command request, streaming output, and completion become one Command view.
- File operations referring to the same patch become one FileChange view.
- Provider status records become track or entry status.

This projection is deterministic and tested. It must not destroy the underlying entry chronology or raw links.

View models also own graceful degradation. Every view model defines:

- The minimum canonical fields required to render.
- Optional enrichment fields and their availability state.
- A compact summary suitable for library, outline, and collapsed views.
- References for large content that can be loaded separately.
- Loading, unavailable, partial, redacted, failed, and unsupported states.

For example, a tool invocation can render from a provider tool name, status, and stable entry ID even when arguments, duration, result, usage, or raw evidence are unavailable. Additional data enriches the component; it does not determine whether the component can exist.

## Size-resilient UI contract

Tracks treats viewport size and data size as independent dimensions:

| Dimension | Cases the shared UI must support |
| --- | --- |
| Viewport | Compact single column, medium overlays, wide persistent rail, expansive multi-rail |
| Track length | Empty, short, ordinary, thousands of entries, active/unbounded |
| Entry payload | One-line summary, ordinary body, huge output/diff, unavailable body |
| Data richness | Minimum canonical facts, partially enriched, provider-rich, unsupported |

Shared components follow these rules:

- The page requests entry windows rather than assuming the entire track is mounted.
- Large bodies use summaries and artifact references, then load on explicit expansion.
- Virtualization is an optimization behind stable anchors, focus, and selection—not a component-specific data contract.
- Rails collapse into overlays before the reading column becomes unusably narrow.
- Components expose the same actions and semantics at every size even when controls move into menus.
- Missing data removes or replaces only the affected enrichment; it never crashes or suppresses the surrounding entry.
- Unknown total counts and active sessions use open-ended pagination/status rather than fabricated totals.

## Error boundaries

Errors are classified by layer:

| Layer | Example | User-visible result |
| --- | --- | --- |
| Source | Permission denied or missing path | Source health error |
| Provider | Unsupported schema/version | Provider diagnostic and partial coverage |
| Parse | Malformed record | Parse entry at source position; rest continues |
| Normalize | Adapter emitted invalid canonical data | Adapter error with conformance detail |
| Index | Transaction or migration failure | Index health error; preserve source data |
| Query/API | Invalid cursor or missing entry | Recoverable request error |
| Render | Markdown/diff component failure | Safe fallback for that entry |

One entry or renderer must not crash the track or application shell.

## Adapter extension strategy

### Phase 1: built-in adapters

Adapters are workspace packages compiled and released with Tracks. This is fastest to validate the contract and safest for local data.

### Phase 2: adapter SDK

Publish types, schemas, sanitized fixtures, conformance tests, and a CLI that validates adapter output.

### Phase 3: isolated external adapters

If third-party installation becomes necessary, run adapters outside the UI and preferably outside the main process. Communicate through a versioned protocol with explicit filesystem grants. Do not load arbitrary adapter React code.

## Architectural invariants

- Provider source files are read-only.
- UI packages never import a provider parser.
- Provider adapters never import UI packages.
- Unknown events are preserved visibly.
- Raw and derived data are distinguishable.
- The index is rebuildable.
- User-created metadata survives rebuilds.
- Every boundary payload is versioned and validated.
- Large content is requested and rendered incrementally.
- No provider is privileged in canonical naming or component structure.
- Claude Code is the only current implementation target; future-provider assumptions remain provisional until fixtures exist.
- Provider terminology is preserved as evidence but translated to Tracks-owned canonical semantics before reaching shared UI.
- Capabilities and data availability are explicit; optional provider data is never assumed or fabricated.
- Logical tracks may be large or unbounded and are ingested, stored, queried, and rendered in bounded slices.
- Provider-authoritative, rebuildable, cached, user-owned, and ephemeral data have distinct retention rules.
- The CLI owns process lifecycle while the web UI owns normal browsing, configuration, and sharing workflows.
- Local links, static share bundles, and remote hosted links are visibly distinct products/security boundaries.
- Export generation is local and deterministic; publishing is separate, explicit, and destination-scoped.
