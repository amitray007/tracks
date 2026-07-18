# Tracks

**A local-first viewer for AI coding-agent sessions.**

[![CI](https://github.com/amitray007/tracks/actions/workflows/ci.yml/badge.svg)](https://github.com/amitray007/tracks/actions/workflows/ci.yml)
[![Secret scan](https://github.com/amitray007/tracks/actions/workflows/secret-scan.yml/badge.svg)](https://github.com/amitray007/tracks/actions/workflows/secret-scan.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-5c6ac4.svg)](LICENSE)

Tracks turns the session files already on your computer into a readable, searchable web interface. Inspect conversations, reasoning availability, tool calls, results, file changes, commands, usage, diagrams, and sub-agent activity without uploading your session library.

Claude Code is supported today. The data model and adapter boundary are designed for more coding agents without forcing the UI to understand every provider's storage format.

> [!IMPORTANT]
> Tracks is pre-release software. The local viewer is the primary supported workflow. Live sharing and the self-hosted server are an early bootstrap implementation and should not be exposed to the public internet without HTTPS and a security review.

## Why Tracks?

Coding-agent transcripts are useful long after a run finishes, but their raw files are difficult to navigate. Tracks provides:

- **A proper local viewer** with compact highlights and complete chronological traces.
- **Fast navigation** across projects and sessions, with text and regular-expression filtering.
- **Rich evidence rendering** for tools, results, syntax-highlighted code, diffs, diagrams, usage, errors, and nested sub-agents.
- **Live updates** while active provider files change.
- **Bounded loading** for large libraries and long-running sessions.
- **Optional live sharing** through a self-hosted server without persisting session payloads on that server.
- **A provider-neutral core** that keeps Claude-specific terminology and parsing inside its adapter.

## Provider support

| Provider | Status | Notes |
| --- | --- | --- |
| Claude Code | Active | Local discovery, normalized sessions, tools, results, usage, file evidence, and sub-agent relationships |
| Codex | Planned | The canonical model already treats richer or missing provider data as optional |
| Grok CLI | Planned | Requires evidence-based discovery and schema research before implementation |

Tracks never invents unavailable provider data. Shared UI components render a documented minimum shape and progressively enhance it when an adapter has richer evidence.

## Quick start

Install the CLI and local viewer with Homebrew:

```sh
brew install amitray007/tap/tracks
tracks doctor
tracks web start
```

Tracks discovers Claude Code sessions from `~/.claude/projects` by default,
starts a loopback-only web server, and opens the viewer. To use another source
directory:

```sh
tracks web start --source /path/to/claude/projects
```

Upgrade or remove Tracks with the normal Homebrew lifecycle:

```sh
brew upgrade tracks
brew uninstall tracks
```

### Run from source

Source development requires Node.js 24 or newer and Corepack.

```sh
git clone https://github.com/amitray007/tracks.git
cd tracks

corepack enable
pnpm install --frozen-lockfile
pnpm build

pnpm tracks doctor
pnpm tracks web start
```

Stop or inspect the local viewer independently:

```sh
pnpm tracks web status
pnpm tracks web stop
```

When running from source, replace `tracks` with `pnpm tracks` in the command examples below.

## Local and connected modes

Tracks has two independent runtime modules inside one lightweight background process:

```text
Claude Code files ──> Tracks agent ──> local web viewer
                           │
                           └── optional outbound connection ──> Tracks server
                                                                  ├── owner dashboard
                                                                  └── scoped live link
```

- `tracks web start` starts only the local viewer.
- `tracks login` verifies and saves server access without starting a connection.
- `tracks connect` starts only the outbound server connection.
- `tracks logout` disconnects and removes saved server access.

You never need the hosted server to use Tracks locally.

## CLI reference

| Command | Purpose |
| --- | --- |
| `tracks doctor [--source <directory>]` | Verify the Claude source and report discovery health |
| `tracks web start [--source <directory>] [--port <number>] [--no-open]` | Start or reuse the local viewer |
| `tracks web stop` | Stop only the local viewer module |
| `tracks web status` | Report local viewer state |
| `tracks login --server <url> --token-stdin` | Verify and save device access without connecting |
| `tracks connect` | Connect using saved server access |
| `tracks connect stop` | Stop only the server connection |
| `tracks logout` | Disconnect and remove saved server access |
| `tracks status [--json]` | Report local and connected state separately |
| `tracks config list` | Show configuration with the token redacted |
| `tracks config get <key>` | Read one public configuration value |
| `tracks config set <key> <value>` | Change a supported configuration value |
| `tracks serve --no-open` | Run the compatibility foreground server |

Use `--token-stdin` instead of a command-line token to avoid leaving credentials in shell history.

## Self-hosted server

The repository includes a Docker Compose deployment for the connected-device dashboard and live links.

```sh
cp .env.example .env

# Generate two different values and place them in .env:
openssl rand -hex 32
openssl rand -hex 32

docker compose up --build -d
curl --fail http://127.0.0.1:8787/api/health
```

Compose binds to `127.0.0.1:8787` by default, runs as a non-root user with a read-only root filesystem, and mounts no session or database volume.

Connect a local device using the device token:

```sh
printf '%s' "$TRACKS_DEVICE_TOKEN" | \
  pnpm tracks login --server http://127.0.0.1:8787 --token-stdin

pnpm tracks connect
pnpm tracks status
```

The owner token signs into the server dashboard. The device token can establish an outbound device connection but cannot enumerate the owner dashboard.

Before exposing a server beyond loopback:

- Put it behind HTTPS/WSS.
- Set `TRACKS_CLOUD_PUBLIC_URL` to the public HTTPS origin.
- Use different high-entropy owner and device tokens.
- Configure reverse-proxy request and connection limits.
- Review the current limitations in [live-sharing.md](docs/architecture/live-sharing.md).

## Privacy model

Tracks reads data that may contain prompts, source code, absolute paths, commands, URLs, and credentials. Its current defaults are intentionally conservative:

- Provider files are opened read-only and remain the source of truth.
- The local service binds to loopback only.
- No session content or telemetry is sent anywhere by default.
- Connecting to a Tracks server is explicit and independent of starting the local viewer.
- The server requests bounded pages from an online device instead of mirroring its library.
- The bootstrap server keeps device presence, share routing, and live payloads in process memory; it does not persist session content.
- Provider Markdown, code, diagrams, and structured values are treated as untrusted input.

A live share is a bearer link to one selected session. Anyone with the complete link can view that session while the source device and server are available. Current live links do not yet have polished expiry and revocation controls, so treat them like credentials. Use reviewed static exports for future durable or offline sharing; that workflow remains on the roadmap.

Read the full [privacy and security model](docs/architecture/privacy-security.md) before deploying or extending network, storage, rendering, or adapter behavior.

## Development

Install dependencies and run the full verification suite:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm check
```

For local development with stable `.localhost` URLs:

```sh
pnpm dev
```

Portless serves the web UI at `https://tracks.localhost` and the API at `https://api.tracks.localhost`. Its first run may require local certificate trust setup.

For plain loopback HTTP:

```sh
pnpm dev:plain
```

This serves the web UI at `http://127.0.0.1:4317` and the local API at `http://127.0.0.1:4318`.

Run only the hosted server during development with:

```sh
pnpm cloud:dev
```

## Architecture

Provider data is normalized before it reaches shared application surfaces:

```text
provider files -> provider adapter -> canonical track model -> local index/API -> web UI
                                                        └-> optional live protocol -> Tracks server
```

Adapters own discovery, parsing, normalization, provider terminology, capabilities, and raw evidence references. Shared components own chronology, navigation, accessibility, filtering, and rendering. Provider adapters do not inject arbitrary UI code.

Start with the [documentation index](docs/README.md), or jump directly to:

- [Product vision](docs/product/vision.md)
- [System architecture](docs/architecture/overview.md)
- [Canonical session model](docs/architecture/session-model.md)
- [Provider adapter contract](docs/architecture/provider-adapters.md)
- [CLI and local runtime](docs/architecture/cli-runtime.md)
- [Live sharing and hosted server](docs/architecture/live-sharing.md)
- [Claude Code provider evidence](docs/providers/claude-code.md)
- [Design documentation](docs/design/README.md)
- [Roadmap](docs/roadmap.md)

## Project status

Tracks is a working vertical slice, not a stable release. The local Claude Code viewer, CLI lifecycle, live updates, server connection, bounded relay, connected-device dashboard, and session-scoped live links are implemented.

Important roadmap work includes reviewed static exports, project-scoped sharing, link expiry and revocation, OS credential storage, SQLite/FTS indexing, production account/device authorization, multi-instance server routing, and additional provider adapters.

## Contributing

Contributions are welcome. Please read:

- [CONTRIBUTING.md](CONTRIBUTING.md) for setup, tests, and the privacy checklist.
- [SUPPORT.md](SUPPORT.md) for questions and troubleshooting.
- [GOVERNANCE.md](GOVERNANCE.md) for how project decisions are made.
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community expectations.
- [SECURITY.md](SECURITY.md) for private vulnerability reporting.

Never attach real private sessions, credentials, source code, personal paths, or unredacted screenshots to a public issue or pull request. Use minimal synthetic fixtures.

## License

Tracks is available under the [MIT License](LICENSE).

Third-party product names and marks identify interoperability and reference behavior only. Tracks is an independent project and is not endorsed by Anthropic or Traces.
