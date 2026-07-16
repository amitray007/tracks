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

The first Claude Code vertical slice is now runnable. It discovers top-level local sessions, normalizes bounded transcript slices, serves them through a loopback API, and renders compact/full views in the web UI.

## Development

Requirements: Node.js 22 or newer and pnpm 10.33.2 through Corepack.

```sh
pnpm install
pnpm check
pnpm dev
```

`pnpm dev` uses the pinned Portless dependency and exposes the web UI at `https://tracks.localhost` with the API at `https://api.tracks.localhost`. The first Portless run may require its local certificate trust setup.

For a plain HTTP fallback without Portless:

```sh
pnpm dev:plain
```

This starts the web UI at `http://127.0.0.1:4317` and the API at `http://127.0.0.1:4318`.

The foreground CLI path serves the production web build and opens an ephemeral loopback URL:

```sh
pnpm build
pnpm tracks -- doctor
pnpm tracks -- serve --no-open
```

## Documentation

Start with the [documentation index](docs/README.md).

- [Product vision](docs/product/vision.md)
- [Product requirements](docs/product/requirements.md)
- [System architecture](docs/architecture/overview.md)
- [Provider adapter contract](docs/architecture/provider-adapters.md)
- [Canonical session model](docs/architecture/session-model.md)
- [CLI and local runtime](docs/architecture/cli-runtime.md)
- [Sharing and hosting](docs/architecture/sharing-hosting.md)
- [Initial runtime decision](docs/architecture/decisions/0001-typescript-loopback-runtime.md)
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

Implemented now: a pnpm/TypeScript workspace, canonical runtime schemas, provider SDK boundary, bounded Claude Code JSONL discovery/parsing, a tested Node loopback API, foreground CLI, production web serving, responsive React session library, compact/full views, and the semantic Hugeicons Free registry.

The implementation intentionally remains a vertical slice. Background CLI lifecycle, SQLite/FTS, live watching, revision-checked raw inspection, rich Markdown/diff rendering, redaction/export, and sharing/hosting are still roadmap work. Portless is pinned for development only and is not a shipped runtime dependency.
