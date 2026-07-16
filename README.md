# tracks

Tracks is a local-first web interface for reading and debugging AI coding-agent sessions.

The initial and current implementation focus is Claude Code. The ingestion and canonical session model are designed so Codex, Grok CLI, and future coding-agent CLIs can later be added through evidence-based provider adapters without rebuilding the interface. Those future adapters are architectural constraints, not current implementation scope.

## Product direction

- Run locally and bind to localhost by default.
- Discover and index provider sessions already stored on the machine.
- Present messages, reasoning availability, tools, commands, file changes, sub-agents, and errors as one readable chronological track.
- Preserve raw provider evidence while offering a normalized, provider-neutral UI.
- Search across projects and providers.
- Remain responsive with long sessions and enormous tool results.
- Make no outbound content or telemetry request by default.
- Start from a small CLI that launches/reuses the local service and opens the browser UI.
- Offer compact and full views of the same evidence.
- Turn one session or a reviewed project session set into a sanitized static share bundle that can be hosted independently.

The project is currently in the documentation and architecture-foundation stage.

## Documentation

Start with the [documentation index](docs/README.md).

- [Product vision](docs/product/vision.md)
- [Product requirements](docs/product/requirements.md)
- [System architecture](docs/architecture/overview.md)
- [Provider adapter contract](docs/architecture/provider-adapters.md)
- [Canonical session model](docs/architecture/session-model.md)
- [CLI and local runtime](docs/architecture/cli-runtime.md)
- [Sharing and hosting](docs/architecture/sharing-hosting.md)
- [Claude Code provider evidence](docs/providers/claude-code.md)
- [Design documentation](docs/design/README.md)
- [Delivery roadmap](docs/roadmap.md)

## Core architectural rule

Provider data is normalized before it reaches the UI:

    Claude Code ─┐
    Codex ───────┼─> provider adapters ─> canonical track model ─> index/API ─> web UI
    Grok CLI ────┘

The installed product flow is:

    tracks CLI -> loopback service/index -> compact/full web UI -> reviewed static share bundle -> optional host

Provider adapters own discovery, parsing, normalization, capabilities, and raw evidence references. Shared UI components own chronology, navigation, accessibility, and rendering. Provider plugins do not inject arbitrary UI code in the initial model.

Shared components render a documented minimum canonical shape and treat richer provider data as optional enrichment. Tracks stores a rebuildable, policy-controlled local index for navigation and search while leaving provider files authoritative and resolving large/raw evidence through revision-safe references by default.

## Status

The project remains in the documentation and evidence-foundation stage. Portless is selected and will be pinned for stable local development URLs/port management; it is not a shipped runtime dependency. The remaining stack proposal—React, a CLI-launched localhost service, SQLite/FTS, Radix UI, a semantic icon layer backed initially by Hugeicons Free, Streamdown, Shiki, and @pierre/diffs—remains subject to validation with sanitized Claude Code fixtures and the measured local corpus.
