# Product requirements

## Status

This document defines the initial product contract. Requirements are provider-neutral unless explicitly marked for the Claude Code MVP.

Claude Code is the only implementation target for the first release. Provider-neutral requirements constrain package boundaries and shared UI contracts; they do not require speculative Codex or Grok CLI parsing before real fixtures are available.

Priority levels:

- **P0:** required for the first useful release.
- **P1:** required before declaring the provider architecture stable.
- **P2:** valuable follow-up.

## Functional requirements

### CLI and local runtime

| ID | Priority | Requirement |
| --- | --- | --- |
| CLI-01 | P0 | Running `tracks` starts or reuses one healthy loopback service and opens the local web UI without requiring manual port selection. |
| CLI-02 | P0 | Keep browsing, source management, inspection, redaction, export, and sharing workflows in the web UI; CLI commands deep-link to the same behavior rather than implementing different defaults. |
| CLI-03 | P0 | Provide foreground serve, status, stop, and doctor commands with bounded human-readable and `--json` output. |
| CLI-04 | P0 | Coordinate concurrent invocations through restrictive user-owned runtime state and recover safely from stale process/port records. |
| CLI-05 | P0 | Leave the service running and print its URL when browser launch fails. |
| CLI-06 | P1 | Provide bounded export/host automation that uses the same policy engine and artifacts as the web UI. |
| CLI-07 | P0 | Use a pinned Portless development workflow with a stable same-origin `.localhost` URL; do not make Portless a shipped runtime dependency. |
| CLI-08 | P0 | Provide `web`, `login`, `connect`, `config`, and `status` command families while keeping detailed source, sharing, and device management in the web surfaces. |
| CLI-09 | P0 | Keep local web and remote connection independently operable inside one user-owned background agent; a server or network failure must not interrupt local viewing. |

### Source management

| ID | Priority | Requirement |
| --- | --- | --- |
| SRC-01 | P0 | Detect common Claude Code session locations without scanning unrelated user directories. |
| SRC-02 | P0 | Let the user add, remove, enable, and disable explicit sources. |
| SRC-03 | P0 | Show provider, path, accessibility, last scan, and parse health for every source. |
| SRC-04 | P0 | Read provider sources without modifying them. |
| SRC-05 | P1 | Detect overlapping or duplicate sources and avoid duplicate tracks. |
| SRC-06 | P1 | Support provider-defined incremental scanning cursors. |
| SRC-07 | P1 | Report unsupported schema/version evidence without failing the entire source. |

### Data ownership and persistence

| ID | Priority | Requirement |
| --- | --- | --- |
| DATA-01 | P0 | Treat configured provider sources as authoritative and never modify or duplicate them wholesale. |
| DATA-02 | P0 | Persist only documented rebuildable metadata, entry envelopes, bounded summaries, capabilities, diagnostics, and policy-allowed search text needed for the product workflow. |
| DATA-03 | P0 | Keep user-owned source approvals, aliases, tags, preferences, and redaction rules separate from rebuildable provider-derived data. |
| DATA-04 | P0 | Resolve large/raw provider content through revision-safe references and report stale or unavailable evidence instead of returning unverifiable bytes. |
| DATA-05 | P0 | Apply redaction and search-exclusion policy before content enters SQLite/FTS, journals, temporary files, or caches. |
| DATA-06 | P0 | Let the user delete/rebuild derived index and cache data without deleting user-owned metadata or provider session files. |
| DATA-07 | P1 | Expose bounded cache size and retention behavior, with a way to clear it independently. |

### Index and library

| ID | Priority | Requirement |
| --- | --- | --- |
| LIB-01 | P0 | Build a local index of sessions and searchable text. |
| LIB-02 | P0 | List sessions by last activity with provider, project, model, status, and key counts through bounded server-backed pages rather than loading the complete library into the browser. |
| LIB-03 | P0 | Search title, project, path, messages, tool names, commands, and changed filenames. |
| LIB-04 | P0 | Filter by provider, project, date range, and completion/error status. |
| LIB-05 | P0 | Preserve useful library results while background indexing continues. |
| LIB-06 | P1 | Explain why a search result matched and link to the matching entry. |
| LIB-07 | P1 | Detect renamed/moved source files without creating duplicate sessions when stable evidence exists. |
| LIB-08 | P0 | Group tracks by stable project identity and support opening a project-scoped session library suitable for reviewed project sharing. |

### Track reading

| ID | Priority | Requirement |
| --- | --- | --- |
| TRK-01 | P0 | Render canonical entries in chronological provider order by default, with a stable URL-addressable latest-first presentation that does not mutate canonical sequence or deep links. |
| TRK-02 | P0 | Support user, assistant, reasoning, tool call/result, command, file change, sub-agent, status, error, and unsupported entries. |
| TRK-03 | P0 | Filter visible entries by canonical kind without reparsing the source. |
| TRK-04 | P0 | Filter the loaded Compact or Full track projection with case-insensitive text or regular expressions, including live match counts, invalid-pattern feedback, an explicit clear action, and a way to continue searching later pages. |
| TRK-05 | P0 | Expand/collapse tool requests, results, reasoning, raw data, and diffs. |
| TRK-06 | P0 | Distinguish provider truncation, Tracks collapsing, unavailable data, redaction, and parse failure. |
| TRK-07 | P0 | Preserve raw provider payload access for every entry when safe and available. |
| TRK-08 | P1 | Provide an outline of messages, tools, changed files, errors, and sub-agents. |
| TRK-09 | P1 | Restore view mode, filters, selected entry, and scroll anchor from the URL where practical. |
| TRK-10 | P0 | Load large sessions through bounded forward and backward pages with automatic intersection loading plus an explicit segmented fallback, while maintaining order, selection, focus, and anchors. |
| TRK-11 | P0 | Render every canonical entry from its documented minimum shape when optional provider data is unavailable. |
| TRK-12 | P0 | Distinguish loading, absent, unsupported, partial, redacted, stale, parse-failed, and policy-hidden data where the distinction affects user understanding. |
| TRK-13 | P0 | Provide compact and full URL-addressable views over the same canonical evidence and preserve entry anchors when switching. |
| TRK-14 | P0 | Make compact view deterministic and reversible: grouped/collapsed mechanics always link to their full entries and are not silently discarded. |
| TRK-15 | P1 | Provide an always-available, accessible way to jump to the top or bottom of long Compact and Full traces without changing trace order. |
| TRK-16 | P0 | Normalize and independently filter Skills, MCP, Channels, Hooks, Claude memory access, and interactive Claude Code commands without duplicating their canonical message/tool/result/status evidence. |

### Specialized rendering

| ID | Priority | Requirement |
| --- | --- | --- |
| RND-01 | P0 | Render agent Markdown safely with code, tables, links, and incomplete streaming input. |
| RND-02 | P0 | Highlight code with a plain-text fallback. |
| RND-03 | P0 | Render command, stdout, stderr, exit code, duration, and sanitized ANSI styling. |
| RND-04 | P0 | Render unified file diffs with operation, path, line numbers, and change counts. |
| RND-05 | P0 | Collapse or defer enormous output and diffs. |
| RND-06 | P1 | Support split diffs when the viewport is wide enough. |
| RND-07 | P1 | Render large structured arguments/results as an accessible collapsible tree. |
| RND-08 | P1 | Offload expensive diffing/highlighting from the main thread. |
| RND-09 | P0 | Keep huge entry bodies outside normal entry payloads and retrieve them through bounded artifact/result views on demand. |
| RND-10 | P1 | Render Mermaid and Graphviz/DOT fences as locally generated, sandboxed diagrams with source, copy, zoom, malformed-input fallback, and source-only handling for recognized unsupported formats. |
| RND-11 | P0 | Give Skills, MCP calls, channel messages, hook outcomes, memory reads/edits, and interactive commands distinct compact renderers with raw provider detail available through progressive disclosure. |

### Live sessions

| ID | Priority | Requirement |
| --- | --- | --- |
| LIVE-01 | P0 | Detect changed Claude Code session sources and update the corresponding track. |
| LIVE-02 | P0 | Avoid stealing scroll position when the user is not following the live tail. |
| LIVE-03 | P0 | Represent partially written records without corrupting already parsed entries. |
| LIVE-04 | P1 | Resume incremental parsing from a provider cursor when supported. |
| LIVE-05 | P1 | Reconcile entries after file rewrite/compaction without unnecessary identity changes. |
| LIVE-06 | P0 | Distinguish source live/recent activity from provider-confirmed process running state. |

### Connected devices and live sharing

| ID | Priority | Requirement |
| --- | --- | --- |
| CON-01 | P0 | Keep local web fully functional without an account, hosted server, or network connection. |
| CON-02 | P0 | Connect a device to Tracks Server through an authenticated outbound connection; never expose the local loopback API as the remote transport. |
| CON-03 | P0 | Provide a hosted owner web view that lists only the authenticated account's currently connected devices and updates presence without a page refresh. |
| CON-04 | P0 | Never persist provider session files, normalized transcripts, session search text, artifacts, or device library listings on Tracks Server. |
| CON-05 | P0 | Request library pages, entry pages, search results, and artifact ranges from an online device only when an authorized server/live viewer needs them, with strict bounds, timeouts, cancellation, and backpressure. |
| CON-06 | P0 | Reuse one local source watcher for local SSE updates and remote revision invalidations; do not mirror complete active sessions on every file change. |
| CON-07 | P1 | Create and revoke an unguessable, share-scoped live URL for one reviewed session or project selection without exposing the private local or server device library. |
| CON-08 | P1 | Show an explicit source-device-offline state at a valid live URL and never serve a stale server-side session copy as if it were current. |
| CON-09 | P0 | Provide a production container and Docker Compose bootstrap that runs non-root/read-only, has a health check, requires authentication, and mounts no session/database volume. |
| CON-10 | P1 | Keep any future durable account/share routing metadata content-free, minimal, revocable, retention-bounded, and independently deletable. |

### Provider adapters

| ID | Priority | Requirement |
| --- | --- | --- |
| ADP-01 | P0 | Keep Claude Code parsing outside UI packages. |
| ADP-02 | P0 | Normalize through a documented adapter contract and canonical session model. |
| ADP-03 | P0 | Declare provider capabilities explicitly. |
| ADP-04 | P0 | Preserve provider IDs, raw event kind, source offsets, and payload evidence where available. |
| ADP-05 | P1 | Validate every adapter against shared conformance fixtures. |
| ADP-06 | P1 | Add a second adapter without modifying core entry rendering for canonical event kinds. |
| ADP-07 | P1 | Version the adapter API independently from provider schemas. |
| ADP-08 | P2 | Support separately installed adapters under an explicit trust model. |
| ADP-09 | P0 | Map Claude Code terminology to Tracks-owned canonical semantics while preserving exact provider event/tool names as evidence. |
| ADP-10 | P0 | Avoid duplicating one provider fact into multiple canonical entry kinds solely to select a specialized renderer. |
| ADP-11 | P0 | Declare adapter-wide capability defaults and session-observed availability separately. |
| ADP-12 | P1 | Require each future adapter to provide an evidence-based terminology map rather than reuse Claude-specific field assumptions. |

### Navigation and utilities

| ID | Priority | Requirement |
| --- | --- | --- |
| NAV-01 | P0 | Support keyboard navigation between visible entries. |
| NAV-02 | P0 | Provide a command palette for sessions, entries, filters, views, and actions. |
| NAV-03 | P0 | Copy stable session-scoped local links and exact content where applicable; opening a copied session link must omit the private local library and must not traverse into unselected related sessions. |
| NAV-04 | P0 | Provide visible focus and deterministic focus return. |
| NAV-05 | P0 | Open a UI-first sanitized sharing workflow for the current track or project selection. |
| NAV-06 | P2 | Compare two tracks or two branches of a track. |

### Sharing and hosting

| ID | Priority | Requirement |
| --- | --- | --- |
| SHR-01 | P0 | Generate an immutable sanitized static bundle for one session at an exact source revision. |
| SHR-02 | P0 | Generate a project bundle from an explicitly reviewed set of session revisions, with a project landing page and bounded search. |
| SHR-03 | P0 | Include compact and full views with stable share-local anchors and no dependency on the local Tracks service. |
| SHR-04 | P0 | Preview paths, prompts, commands, reasoning, URLs, attachments, raw payloads, and redaction warnings before generating a bundle. |
| SHR-05 | P0 | Exclude raw payloads, absolute source paths, local IDs/tokens, remote assets, analytics, and unselected attachments by default. |
| SHR-06 | P0 | Preview generated files through a loopback-only static host and clearly label local-only links. |
| SHR-07 | P0 | Produce a directory or ZIP that can be deployed to an ordinary static host without server-side code. |
| SHR-08 | P1 | Ship one preferred publisher as a destination-scoped upload of an already-approved bundle with explicit visibility, update, retention, and deletion semantics. |
| SHR-09 | P1 | Show a revision/inclusion diff before refreshing an existing session or project share. |
| SHR-10 | P1 | Return a copyable public/direct/private hosted URL in one short UI flow, without making publisher authentication required for local viewing or static export. |
| SHR-11 | P2 | Support additional publisher integrations through the restricted bundle-only contract. |
| SHR-12 | P0 | Keep the local session-link presentation and generated single-session bundle free of the local library; project navigation appears only in explicitly reviewed project bundles. |

## Privacy and security requirements

| ID | Priority | Requirement |
| --- | --- | --- |
| SEC-01 | P0 | Bind the application server to 127.0.0.1 by default. |
| SEC-02 | P0 | Make no outbound content request or telemetry request by default. |
| SEC-03 | P0 | Treat all provider content, Markdown, HTML, ANSI, paths, URLs, and attachments as untrusted. |
| SEC-04 | P0 | Limit filesystem reads to configured sources and explicitly opened artifacts. |
| SEC-05 | P0 | Block remote images/embeds by default. |
| SEC-06 | P0 | Sanitize logs and error reports to avoid accidental prompt, secret, or path disclosure. |
| SEC-07 | P1 | Provide configurable redaction for paths, environment values, and detected secret patterns. |
| SEC-08 | P1 | Make export redaction status explicit and previewable. |
| SEC-09 | P1 | Prevent provider adapters from injecting executable UI code in the first plugin model. |
| SEC-10 | P0 | Treat export, non-loopback hosting, and publishing as explicit destination-named boundaries; opening or copying a local link never uploads content. |

See [Privacy and security](../architecture/privacy-security.md).

## Quality attributes

### Performance

- Open indexed normal sessions with useful content visible in under 500ms on a representative development machine.
- Keep search/filter response below 100ms perceived latency for normal fixtures.
- Navigate a 5,000-entry track without persistent dropped-frame patterns.
- Avoid eager Markdown highlighting, diffing, or raw tree construction for off-screen collapsed content.
- Ingest, query, and render entry windows without requiring a complete logical track in one in-memory or API payload.
- Keep compact/full view switching responsive without rebuilding or reparsing the track.

### Reliability

- One malformed record does not discard the rest of the session.
- Source parse errors identify provider, file, approximate offset, and recoverability.
- Re-indexing is idempotent.
- Track and entry identities remain stable when source evidence remains stable.
- Schema migrations preserve the ability to rebuild from provider sources.

### Accessibility

- Target WCAG 2.2 AA.
- Complete core workflows with keyboard only.
- Maintain accessible alternatives for split diffs, color status, drag, hover actions, and animation.
- Test virtualization and live updates with screen readers.

### Portability

- Primary development target: macOS, because Claude Code session discovery is initially validated there.
- Architecture must avoid macOS-only assumptions in the canonical model and web UI.
- Linux support should require source-path and system-integration work, not a rewrite.
- Windows path semantics must be represented correctly before claiming support.

### Maintainability

- No provider-specific conditionals in shared entry components for behavior expressible through the canonical model.
- Canonical schema and adapter API use explicit versions.
- Provider fixtures are sanitized and committed.
- Derived index data can be rebuilt.
- UI components consume typed view models, not raw provider JSON.
- Shared components consume semantic icon names; direct icon-package imports are confined to the central icon registry.

## MVP acceptance scenarios

### Start the local viewer

Given an installed CLI and approved Claude source, running `tracks` starts or reuses a loopback service, opens the browser at the correct local URL, and incrementally renders useful library results without requiring an account or manual port selection.

### Find and open

Given an allowed Claude Code source containing several projects, when the user starts Tracks, then the library incrementally appears, search finds a phrase from a prompt, and opening the result focuses the matching entry.

### Read a normal session

Given a session with messages, reasoning availability, commands, tools, and file edits, the user can follow the narrative, inspect exact evidence, copy content, and open full diffs without raw provider fields dominating the default view.

### Move between compact and full views

Given a tool-heavy session, compact view presents a shorter deterministic narrative while full view retains every canonical and unsupported entry. Switching views preserves the selected evidence anchor and explains grouped/collapsed mechanics.

### Handle a live session

Given a provider file receiving new records, Tracks adds normalized entries, marks partial data correctly, follows only when the user is at the live tail, and offers a new-entry action otherwise.

File activity alone is labeled live/recently active rather than provider-confirmed running.

### Survive malformed input

Given a valid session containing one malformed or unknown record, Tracks renders valid entries around it and inserts a visible parse/unsupported entry with raw evidence and source location.

### Handle a huge result

Given a multi-megabyte tool result or thousand-line diff, Tracks shows a summary quickly, does not block track navigation, and loads the full content only on request.

### Prove provider neutrality

Given a minimal second test adapter, its user, assistant, command, tool, file change, and error entries render through the same shared components without provider-specific UI branches.

This is a provider-architecture acceptance scenario, not a first-release implementation requirement.

### Render reduced provider data

Given a canonical fixture that supplies only minimum message and tool shapes, with reasoning, usage, diffs, duration, and raw payloads unavailable, the track remains readable, available actions still work, and each missing enrichment is omitted or explained without component failure.

### Preserve the storage boundary

Given a source containing a large result and seeded sensitive value, Tracks indexes only the policy-approved bounded projection, retrieves full content on demand through a revision-checked reference, and removes derived copies through the documented deletion/rebuild flow without modifying the provider source.

### Share one session

Given an inspected track, the user opens Share in the web UI, reviews redaction and included artifacts, generates and previews a compact/full static bundle, and obtains a hosting-ready directory/ZIP containing no unapproved raw data or remote dependency.

### Share a project snapshot

Given several tracks associated with one project, the user selects exact session revisions, previews the project landing page/library, and generates a searchable static project bundle. Sessions discovered later are not added automatically.

## Open product decisions

- Whether “Track” becomes a visible noun or remains primarily the product name.
- Whether the MVP derives session titles locally and how derived text is labeled.
- Which Claude Code source formats and versions are supported initially.
- Whether live following is enabled by default.
- Which redaction rules are automatic versus opt-in.
- Whether sanitized export is HTML, a directory bundle, JSON, or multiple formats.
- How much hidden/reasoning content should participate in default search.
- Whether the first stable release includes light theme or follows shortly after.

These decisions should be recorded explicitly as implementation evidence becomes available.
