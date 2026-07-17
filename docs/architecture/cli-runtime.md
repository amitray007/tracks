# CLI and local runtime

## Product role

Tracks is installed and started as a CLI, but the web UI is the product surface. The CLI owns local process lifecycle, source access, indexing, the loopback API, browser launch, diagnostics, and optional export hosting. Browsing, filtering, inspecting, configuring sources, redacting, exporting, and sharing happen primarily in the web UI.

The default experience is:

1. Run `tracks` from any terminal.
2. Reuse a healthy local Tracks service or start one on a free loopback port.
3. Discover or incrementally scan approved Claude Code sources.
4. Open the local web UI in the browser.
5. Continue indexing and watching in the background while the library remains usable.

No account, login, cloud service, or network connection is required for the local viewer.

## Initial CLI surface

Exact names remain subject to implementation testing, but the first CLI should stay small:

| Command | Purpose |
| --- | --- |
| `tracks` | Start/reuse the service and open the web UI |
| `tracks serve` | Run the service in the foreground and print its local URL |
| `tracks open [track-or-project]` | Open the UI at a known local track/project when resolvable |
| `tracks status` | Report process, URL, source/index health, and version without printing session content |
| `tracks stop` | Stop the user-owned background service cleanly |
| `tracks doctor` | Diagnose binding, permissions, database, source discovery, watcher, and browser-launch problems |
| `tracks export ...` | Optional automation path for the same safe export engine used by the UI |
| `tracks host ...` | Preview/serve an already-created share bundle; loopback by default |

The CLI supports `--json` for lifecycle and automation commands. It does not print unbounded session content by default.

## Service lifecycle

- Bind only to `127.0.0.1` and `::1` by default.
- Prefer an available ephemeral port in the installed product unless the user configures one.
- Use a user-specific lock/state file so simultaneous `tracks` invocations converge on one healthy service rather than racing into multiple index writers.
- Publish service readiness only after authentication, source policy, database migration, and static assets are ready.
- Print and store the actual local URL in user-specific runtime state with restrictive permissions.
- Detect stale PID/state files and recover without deleting the index.
- Shut down watchers, workers, and database transactions cleanly.
- Browser-launch failure leaves the service running and prints the local URL.

The browser and API use one origin in production. A per-launch secret or equivalent same-user mechanism protects sensitive API responses from unrelated local pages and processes.

## Web UI ownership

The web UI owns:

- Library search, filtering, project grouping, and source health.
- Compact and full session views.
- Live/recently-active state and follow-tail behavior.
- Raw/normalized inspection.
- Source approvals and indexing/redaction preferences.
- Single-session and project sharing workflows.
- Share preview, inclusion, redaction, export generation, hosting target selection, progress, and copy-link.

CLI flags may deep-link to these workflows, but they must not create a second product with different defaults or security behavior.

## Portless development workflow

Tracks uses [Portless](https://github.com/vercel-labs/portless) for local development port management and a stable development URL such as `https://tracks.localhost`.

Development rules:

- Pin an exact Portless version in the development dependency/lockfile because the tool is pre-1.0.
- Use Portless only for development orchestration; the shipped Tracks CLI must not require users to install Portless.
- Keep browser traffic same-origin. The development web server proxies `/api`, `/artifacts`, and the live-event endpoint to the local Tracks service.
- Both the web development server and API bind to loopback unless a developer explicitly chooses another mode.
- Respect Portless-injected `PORT`, `HOST`, and `PORTLESS_URL` rather than hard-coding ports.
- Document the one-time local CA trust step and provide a plain-HTTP development fallback.
- Do not enable Portless LAN, Tailscale, or Funnel modes from the ordinary development command. Those modes expand the network boundary and require an explicit security review and developer action.
- Add a health endpoint and ensure hot reload, SSE/WebSocket traffic, and API proxying work through the stable origin.

A likely script shape is `pnpm dev` delegating to a pinned Portless command. The exact monorepo invocation is decided after the server/web package layout exists; the stable URL and same-origin behavior are the contract.

## Local live updates

The Claude vertical slice recursively watches the configured source and publishes named invalidation events over same-origin SSE. Events contain scan metadata and a changed basename, never an absolute source path. The browser uses native reconnect, refreshes the library, and reparses the complete selected track. This distinguishes source activity from process liveness without claiming that Claude is still running.

The current implementation deliberately reparses rather than inventing append-only semantics for files that Claude may rewrite. Later indexing work should replace the full selected-track refresh with verified bounded deltas while preserving the same visible behavior:

- New verified records update the open track and sidebar without manual refresh.
- Partial trailing records retain previously parsed entries and show a partial/live state.
- The UI follows only when already at the live tail.
- Away from the tail, a new-entry affordance reports the bounded count or “new activity” when the total is unknown.
- A file that has merely changed recently is labeled recently active, not definitely running.
- Rewrite/compaction triggers verified range replacement or a safe reparse while preserving stable identities where evidence permits.

## Packaging boundary

The installed artifact contains the CLI, local service, migrations, and static web application. The development Vite server and Portless are not included in the runtime dependency chain. A later desktop wrapper may launch the same service but does not replace the CLI/local-service architecture.
