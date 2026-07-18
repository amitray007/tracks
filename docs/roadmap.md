# Delivery roadmap

## Roadmap philosophy

Tracks should prove one end-to-end provider deeply before building a general plugin ecosystem. At the same time, provider-specific parsing must live behind the adapter boundary from the first line of production code.

Milestones are capability gates, not calendar promises.

The active implementation scope is Claude Code. Codex and Grok CLI are deferred until the Claude vertical slice establishes real normalization, persistence, and UI evidence. Future-provider examples may test whether a boundary is provider-coupled, but speculative adapters or speculative fields are not Phase 0/1 work.

## Phase 0 — Evidence and foundations

### Objective

Remove the largest unknowns before committing to framework and packaging choices.

### Work

- Collect sanitized Claude Code fixtures covering normal, live, partial, malformed, compacted, tool-heavy, sub-agent, and huge-result sessions.
- Document observed Claude Code storage locations, formats, identifiers, and version drift.
- Maintain the provider-specific evidence inventory in `docs/providers/claude-code.md`; treat the external Claude schema project as configuration/CLI evidence, not a transcript schema.
- Create a Claude Code terminology map from provider record kinds/tools to canonical facts, including records that remain unsupported.
- Build a throwaway parser spike that reports record kinds and field coverage.
- Validate stable track/entry ID strategies across reparses and file growth.
- Validate revision-safe raw references across append, rewrite, move, and compaction.
- Decide and document the field-level persistence matrix for derived index, FTS, cache, user-owned data, and ephemeral state.
- Define the minimum renderable shape and optional enrichment for every P0 canonical entry/view model.
- Prototype Markdown, diff, ANSI, and large structured-data rendering.
- Benchmark transcript virtualization with heterogeneous entry heights.
- Prototype chunked adapter ingestion and anchor-based entry retrieval without loading a complete track payload.
- Prototype keyboard and screen-reader behavior for windowed long tracks.
- Confirm localhost packaging options on macOS and a path to Linux.
- Spike the `tracks` CLI lifecycle: free loopback port, single-instance state, readiness, browser launch, status, stop, and stale-state recovery.
- Establish a pinned Portless development command and verify same-origin API/live-update proxying through `https://tracks.localhost`.
- Prototype compact and full projections over the same entry IDs.
- Prototype a sanitized dependency-free single-session static bundle and loopback preview.
- Audit Hugeicons Free against the complete semantic vocabulary, compact-size legibility, bundle output, accessibility, and the pinned packages' distribution terms; record any custom-glyph gaps.
- Turn design tokens and core components into interactive stories.

### Exit criteria

- At least one real-format sanitized fixture for every P0 canonical event kind.
- Unknown/malformed records do not abort parsing.
- Stable IDs survive append and unchanged reparse.
- Raw evidence either verifies against its recorded revision/hash or becomes explicitly stale/unavailable.
- No persisted field lacks an ownership, redaction, retention, and deletion decision.
- Minimum-shape and Claude-rich fixtures render through the same components.
- A 5,000-entry synthetic track scrolls acceptably.
- A 1,000-line diff does not mount eagerly in the main transcript.
- The process/runtime choice has a written decision.
- One CLI command reaches a healthy local UI without manual port management.
- Compact/full switching preserves evidence anchors.
- A sanitized session bundle opens without the local service and makes no remote request.
- Shared stories use semantic icon names through one registry, with no direct icon-package imports outside that boundary.

## Phase 1 — Claude Code vertical slice

### Objective

Deliver one complete local path from Claude Code source to a polished track.

### Work

- CLI-launched local process and authenticated loopback API.
- Service lifecycle/status/doctor and browser opening.
- Explicit Claude Code source configuration.
- Metadata scan and SQLite index.
- Minimal Claude Code adapter behind provider-sdk.
- Bounded/chunked normalization path from the adapter into the index.
- Session library with project/date/provider filters.
- Track reading mode for messages, reasoning availability, tools, commands, file changes, errors, and unsupported events.
- Compact and full track views over one canonical chronology.
- Raw provider payload inspector.
- Explicit unavailable/redacted/stale states for raw and optional provider data.
- Deep links to tracks and entries.
- Safe Markdown, code, output, and unified diff rendering.
- Basic keyboard navigation and command palette.
- UI-first single-session share preview, static bundle generation, and loopback bundle preview.
- Dark theme and essential empty/error/loading states.

### Exit criteria

- The “find and open,” “read a normal session,” and “survive malformed input” acceptance scenarios pass.
- Provider parsing is absent from UI packages.
- Raw content is fetched only on demand.
- Large logical tracks are not required to cross an adapter or API boundary as one payload.
- Index/cache contents match the documented persistence matrix and deletion flow.
- The application works with network access disabled.
- Running `tracks` is sufficient to start/reuse and open the local viewer.
- The single-session static share acceptance scenario passes.
- Known XSS/ANSI/path traversal fixtures render safely.

## Phase 2 — Claude Code MVP

### Objective

Make the vertical slice reliable enough for daily personal use.

### Work

- Conservative source auto-detection with user approval.
- Incremental scanning and live file watching.
- Partial-tail reconciliation and live-follow behavior.
- Full-text search with match reasons and entry links.
- Track outline and changed-file navigation.
- Project-scoped library and explicit multi-session selection.
- Virtualized long tracks and large structured data.
- Worker-backed highlighting/diffing where required.
- Source health and parse coverage reporting.
- Redaction settings and index deletion/rebuild.
- Project static-share generation with a landing page, bounded search, and exact revision manifest.
- Export history/status as user-owned local metadata.
- One preferred publisher for an explicit public/direct/private hosted URL, fed only the approved static bundle.
- Light theme or a documented follow-up decision.
- Visual, accessibility, parser, security, and performance test suites.

### Exit criteria

- All P0 product requirements pass.
- 5,000-entry, huge-diff, live, and malformed fixtures meet quality targets.
- Keyboard-only core workflow passes.
- No outbound request occurs in the default configuration.
- Index rebuild preserves user-owned settings/metadata.
- Claude Code format coverage and limitations are documented.
- Session and project share bundles pass offline, redaction, CSP, and static-host tests.
- The preferred publisher completes the reviewed bundle-to-hosted-link workflow without becoming a local-viewer dependency.

## Phase 3 — Connected devices and live sharing

**Current vertical slice (July 2026):** the single background agent, local-web and CLI connection/logout controls, separate bootstrap owner/device credentials, HttpOnly owner sessions, online-device dashboard/viewer, bounded library/track relay, catalog invalidations, per-session capability links, logout-aware offline state, and hardened single-container bootstrap are implemented and covered by process-level E2E tests. The work list below remains the full production exit bar; browser device grants, multi-account authorization, project scopes, revoke/expiry, cancellation, rate/load testing, and multi-instance routing are still open.

### Objective

Add the optional hosted server web experience without turning Tracks into a session-storage service or weakening the local product.

### Work

- Finish one background-agent lifecycle for `tracks web`, `tracks connect`, and `tracks status`.
- Add browser/device-flow login, revocable device identity, secure credential storage, and reconnect with jitter.
- Ship the self-hosted Tracks Server dashboard for authenticated connected-device presence.
- Route cursor-bounded library and track pages from online devices through the versioned live protocol.
- Reuse local file watching for remote revision invalidations and on-demand viewer refresh.
- Add scoped live links for reviewed individual sessions and project selections.
- Render deliberate device-offline, reconnecting, revoked, expired, unauthorized, and source-changed states.
- Add request cancellation, payload ceilings, rate limits, backpressure, and server audit metadata that contains no session content.
- Document TLS reverse-proxy deployment and evolve the single-process Compose bootstrap without adding session persistence.
- Keep reviewed static bundles as the offline/durable alternative to a live link.

### Exit criteria

- Local web works unchanged while logged out, disconnected, or when Tracks Server is unavailable.
- The server dashboard shows only authenticated, currently connected devices and updates in real time.
- A live viewer receives only its reviewed scope and cannot enumerate either private sidebar.
- Disconnecting the source device produces the documented offline state at the same live URL.
- Server process, filesystem, logs, and network tests demonstrate that no session payload or library listing is retained after delivery.
- Load tests prove bounded memory per device/viewer and correct cancellation/backpressure for slow viewers.
- A fresh self-hosted deployment starts from the documented Compose file and passes health/security checks.

## Phase 4 — Provider-neutral proof

### Objective

Prove that the architecture is genuinely pluggable by adding a second provider.

### Provider choice

Codex is the recommended second adapter if its available session evidence exercises different storage and event shapes. The decision should be driven by format access, real fixtures, and conceptual difference rather than brand priority.

### Work

- Build the second adapter using only public provider-sdk boundaries.
- Add cross-provider canonical fixtures.
- Refine capabilities for provider/session variability.
- Validate shared library filters, search, entry rendering, and keyboard behavior.
- Add provider-specific raw metadata sections without provider-specific UI branches.
- Record canonical concepts that did not generalize cleanly.
- Version and migrate the canonical model only when evidence requires it.

### Exit criteria

- Shared components render ordinary canonical events from both providers.
- Provider-name branching is limited to branding, discovery, explicit capabilities, and adapter-owned data transformation.
- Unsupported second-provider events remain inspectable.
- Cross-provider search and filtering work.
- Conformance tests prevent adapter-specific assumptions.

## Phase 5 — Adapter SDK

### Objective

Make provider development repeatable before allowing arbitrary installation.

### Work

- Publish provider-sdk types and runtime schemas.
- Provide adapter scaffolding and a validation CLI.
- Document discovery, scanning, normalization, raw references, diagnostics, and incremental updates.
- Ship sanitized golden fixtures and conformance tests.
- Add a local adapter development mode with raw/normalized diffing.
- Define adapter and canonical schema compatibility policy.
- Build a Grok CLI adapter or a deliberately different test provider.

### Exit criteria

- A new built-in adapter can be created without reading core UI implementation.
- Conformance tooling catches unstable identity, dropped unknowns, invalid paths, oversized payloads, and schema violations.
- Adapter coverage/diagnostics are visible in the product.
- At least three provider shapes have informed the contract.

## Phase 6 — External adapters and managed publishing

### Objective

Extend the ecosystem and add optional managed publishing without weakening local security or interface cohesion.

### Work

- Design subprocess/sandbox adapter protocol.
- Explicit install, trust, grant, update, disable, and removal flow.
- Resource and network limits.
- Signed/publisher-aware distribution strategy if warranted.
- Public publisher protocol/SDK for already-approved bundles.
- Additional hosting integrations with update/revoke semantics.
- Optional session comparison.
- Evaluate self-hosted/team review separately from the local application.

### Exit criteria

- External adapters cannot inject UI code or access ungranted sources.
- Adapter protocol is schema/version validated and resource bounded.
- Publisher integrations cannot read provider sources or the unrestricted local index.
- Publishing remains optional; dependency-free static bundles continue to work independently.
- The local-only core remains fully functional without ecosystem services.

## Cross-cutting workstreams

### Design system

- Implement semantic tokens before screen-specific styling.
- Build EntryFrame and renderer contracts before a large component catalog.
- Maintain visual regression at four layout widths.
- Review motion under CPU load and reduced-motion settings.

### Fixture program

- Every production bug creates or improves a sanitized fixture.
- Fixtures record provider/adapter versions and expected diagnostics.
- Large fixtures may be generated deterministically when real content cannot be committed.
- No fixture contains real credentials or personal absolute paths.

### Privacy and security

- Threat-model changes that expand filesystem, network, export, or adapter authority.
- Keep outbound behavior off by default.
- Continuously test sanitization, source confinement, and secret leakage.

### Sharing and hosting

- Treat compact/full static rendering as a product surface, not a debug export.
- Test single-session and project bundles on file/static-host paths with no local API.
- Keep export generation local and publisher uploads destination-scoped.
- Every share fixture includes seeded paths, secrets, external URLs, reasoning, attachments, and raw-evidence states.
- Refreshing a share always compares included source revisions first.

### Documentation

- Update product requirements when scope changes.
- Update canonical schema and adapter docs with code changes.
- Record meaningful architecture choices as ADRs under docs/architecture/decisions.
- Keep provider format notes separate from provider-neutral contracts.

## Recommended first implementation order

1. Fixture reader and Claude Code format inventory.
2. Claude terminology/field-coverage map and identity/rewrite experiments.
3. Persistence/redaction matrix and revision-safe raw-reference design.
4. Canonical model runtime schemas with minimum shapes and availability states.
5. Chunked provider adapter contract and conformance harness.
6. Claude Code scanner/parser.
7. SQLite index, FTS policy, and rebuild/deletion path.
8. CLI lifecycle plus minimal local API with anchor-based entry retrieval.
9. Pinned Portless same-origin development path.
10. Session/project library.
11. EntryFrame plus minimum-shape message/tool/error renderers.
12. Compact/full projections and routing.
13. Markdown, command, structured data, and diff renderers.
14. Search, filters, outline, and keyboard navigation.
15. Single-session then project static-share bundles and local preview.
16. Live updates and partial-tail reconciliation.
17. Background agent lifecycle, device authentication, and hosted presence.
18. Bounded online-device relay and scoped live shares.
19. Security, accessibility, and performance hardening.

This ordering prevents the visual layer from accidentally becoming the provider model.

## Decision log candidates

Create an ADR before locking in:

- Runtime language and packaging strategy.
- CLI process lifecycle, runtime-state directory, and browser-launch behavior.
- Portless development topology and same-origin proxy contract.
- Provider-authoritative versus indexed/cached/user-owned data boundary.
- SQLite schema and migration tool.
- Redaction-before-indexing rules and cache retention/deletion behavior.
- Incremental SSE payload shape after the accepted invalidation-and-refetch vertical slice.
- Canonical runtime validation library.
- Revision-safe raw references and raw payload cache versus on-demand source reads.
- Adapter chunking, transaction staging, and backpressure limits.
- Entry virtualization strategy and scroll anchoring.
- External adapter isolation protocol.
- Export format and sanitization model.
- Static bundle routing/search strategy and publisher protocol.

## Definition of “pluggable”

Tracks may call itself pluggable only when:

- At least two materially different providers ship.
- Both implement the same documented adapter contract.
- Shared UI consumes canonical entries and capabilities.
- Unknown provider events remain visible.
- Adapter conformance tests exist.
- Adding the second provider did not require rewriting the session library or ordinary entry components.

A directory named plugins or an interface with one implementation is not sufficient evidence.
