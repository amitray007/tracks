# Product vision

## One-line definition

Tracks is a CLI-launched, local-first viewer and sharing tool for AI coding-agent sessions.

## Product promise

Run one CLI, open a polished localhost application, and understand what an agent was asked, what it reasoned about when available, which tools it used, what it changed, what failed, and how to return to the important moment. When needed, turn one session or a reviewed project's sessions into a sanitized, hostable viewing experience quickly.

## The problem

Coding-agent CLIs optimize for live interaction, not later comprehension. Their stored session formats are provider-specific, often undocumented, and difficult to browse directly. Terminal scrollback loses structure, long tool results dominate the narrative, file changes are hard to correlate with prompts, and comparing sessions across providers requires different tools.

Users need a durable reading layer that:

- Discovers sessions already stored on their machine.
- Turns provider data into a coherent chronological document.
- Preserves raw evidence instead of replacing it with an opaque summary.
- Makes tools, commands, diffs, failures, and sub-agents easy to inspect.
- Searches across projects and providers.
- Remains useful when a provider changes its schema or emits unknown events.
- Does not upload private source code or prompts.

## Primary users

### Individual developer

Wants to revisit yesterday's agent work, recover a useful command, understand why a change was made, or continue from the right context.

### Agent power user

Runs many sessions in parallel and needs fast search, filtering, live status, and comparison across projects and providers.

### Tool or adapter developer

Needs normalized and raw views to understand provider formats, diagnose parser gaps, and validate a new adapter.

### Team evaluator, later

Wants to review sanitized exported sessions or compare agent behavior. Shared/team infrastructure is intentionally later than the local product.

## Core jobs to be done

1. **Find a session:** I remember the project, prompt, file, command, or approximate date—not the provider's session ID.
2. **Understand the narrative:** Show the human/agent conversation without drowning it in raw payloads.
3. **Inspect the evidence:** Reveal exact commands, tool arguments, results, diffs, timestamps, and provider metadata.
4. **Diagnose failure:** Distinguish an agent/tool failure from a parsing or rendering problem.
5. **Follow live work:** See new entries without losing my reading position.
6. **Move between providers:** Use one event vocabulary and keyboard model while retaining provider identity.
7. **Share deliberately:** Export a redacted artifact without turning the core application into a cloud service.
8. **Share at the right scope:** Publish one exact session or a reviewed snapshot of a project's sessions without accidentally including future/private work.
9. **Move between overview and evidence:** Read a compact narrative first, then move to the complete chronology and raw evidence without losing context.

## Product principles

### Local by default

Tracks binds to localhost, reads explicitly allowed sources, makes no outbound content requests by default, and stores its index locally.

The installed CLI is the entry point and the browser UI is the product. Running `tracks` starts or reuses the loopback service, opens the UI, and keeps discovery/indexing/live updates local without requiring an account.

### Evidence over interpretation

Tracks may derive titles, summaries, and counts, but the raw provider evidence remains inspectable. Derived content is labeled and can be regenerated.

### Normalize structure, preserve meaning

Providers map into a canonical event model. Unknown or provider-specific data is retained rather than silently discarded.

### Progressive disclosure

The default reading view emphasizes the narrative. Exact arguments, output, raw payloads, and large diffs are available with deliberate expansion.

Compact and full views are two deterministic projections of the same canonical evidence. Compact view groups and collapses low-signal mechanics; full view exposes the complete normalized chronology. Switching views preserves stable entry links and never deletes evidence.

### Provider-neutral, not provider-erasing

The interaction model is shared, but provider, model, capabilities, and source limitations remain visible.

### Graceful under provider asymmetry

Provider richness is optional enrichment, not a condition for a valid track. A session with messages and coarse tool events remains readable even when reasoning, usage, cost, diffs, sub-agents, duration, stable IDs, or raw payloads are unavailable. Tracks explains meaningful absence and never fabricates parity between providers.

### Large sessions are ordinary

Virtualization, incremental parsing, collapsed results, and search indexing are foundational requirements, not later optimizations.

### Beautiful defaults

Tracks ships with a coherent visual and interaction system. Provider plugins do not fragment the interface with arbitrary styling.

### Portable sharing

Sharing begins with a sanitized static bundle that can be previewed locally and hosted independently. Export generation and publishing are separate: Tracks never uploads merely because a user opened a share dialog or copied a local link.

## Differentiation

Tracks should be differentiated by the combination of:

- Local privacy and transparent source access.
- A polished technical-document reading experience.
- A canonical model spanning multiple CLIs.
- Raw/normalized dual inspection for trust and adapter development.
- Purpose-built command, Markdown, structured-data, and diff renderers.
- Performance on long, messy, partially written sessions.
- A stable adapter SDK rather than provider logic embedded in the interface.
- A fast path from private local inspection to polished session/project sharing without making cloud storage mandatory.

## Initial scope

The initial implementation supports Claude Code only. The canonical boundary is designed to avoid Claude-specific UI coupling, but Codex, Grok CLI, and other adapters are later evidence-driven work.

The first usable product includes:

- A CLI that starts/reuses the loopback service and opens the web UI.
- Automatic or guided Claude Code source detection.
- Local indexing and session library.
- Provider/project/date/status filtering and full-text search.
- Track reading and inspection modes.
- Compact and full track views with stable cross-view anchors.
- User, assistant, reasoning availability, tool, command, file change, sub-agent, status, error, and unsupported entries.
- Safe Markdown, code, terminal-output, structured-data, and diff rendering.
- Live refresh for active sessions where the source format permits it.
- Deep links to sessions and entries.
- Raw normalized and provider payload inspection.
- Local settings for source paths, redaction, theme, wrapping, and live following.
- Sanitized static sharing for one session and a reviewed set of project sessions, with local preview and hosting-ready output.
- An optional preferred publisher shortly after the local/static path, providing a short reviewed bundle-to-hosted-link workflow without becoming a viewer dependency.

## Explicit non-goals for the first release

- Executing prompts, tools, or commands.
- Editing provider session files.
- Replacing Claude Code, Codex, or another CLI.
- Built-in cloud synchronization, accounts, or a managed multi-user hosting service. Portable static hosting remains in scope.
- Multi-user accounts, permissions, comments, or review workflows.
- Arbitrary third-party React UI plugins.
- Perfect semantic normalization of every provider concept.
- Automated quality scoring of agents.
- Cost analytics as the primary product experience.
- A mobile-first authoring workflow.

## Product boundaries

Tracks is primarily read-only. Actions such as “open file,” “reveal source,” or “copy command” cross into the operating system only after explicit user input. A future “continue session” action must be designed as a clearly visible handoff to the provider CLI, not hidden execution.

Exporting or publishing is also an explicit boundary. A local link works only on the same machine. A static bundle contains an immutable reviewed snapshot. Any later managed publisher names the destination, visibility, included revisions, and redaction state before upload.

## Success indicators

Early success is qualitative and workflow-based:

- A user can find a known session from project/date/text without knowing its ID.
- A normal session becomes readable within seconds of starting Tracks.
- A 5,000-entry fixture remains navigable.
- Unknown provider events are visible and reportable, not lost.
- Users can tell whether content is provider-supplied, Tracks-derived, truncated, or redacted.
- Adding a second provider does not require changes to shared transcript components for ordinary canonical events.
- The application is useful with network access disabled.
- Running one CLI command reaches a healthy local library without requiring the user to manage a port manually.
- Compact view shortens the reading path while every included item remains traceable to full evidence.
- A sanitized single-session or project bundle opens without the local service and performs no remote request by default.

Potential quantitative measures are local and opt-in during development:

- Time to first useful content.
- Search/filter latency.
- Parse coverage by provider event type.
- Number of unsupported or malformed entries.
- Long-task and scroll performance.

No product telemetry should be enabled by default.

## Future directions

After the local viewer and adapter boundary are stable:

- Codex and Grok CLI adapters.
- A documented adapter test kit and fixture format.
- Side-by-side session comparison.
- Cross-session file and command history.
- Sanitized, portable export packages.
- Optional team/self-hosted review mode.
- Provider launch/continue handoffs.
- Local semantic search, provided its model and privacy behavior are explicit.

These are options, not commitments. The core reading experience and data trustworthiness take priority.
