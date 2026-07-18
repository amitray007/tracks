# Claude Code provider evidence

## Purpose

This document records the evidence used to build the first Tracks adapter. It is provider-specific by design. Canonical model changes must cite an observed Claude Code shape or a deliberate cross-provider requirement rather than treating this inventory as universal.

No prompt text, command text, tool arguments, project name, source path, credential, or raw payload from a local session is reproduced here.

## Evidence baseline

The adapter is based on:

- Local Claude Code CLI `2.1.211` and its generated `--help` surface.
- The `claude-code-schema` release matching that CLI version.
- Sanitized structure-only fixtures limited to record names, key names, value types, and synthetic values.
- Synthetic stress cases covering large files, large source trees, partial records, and nested agent layouts.

The `claude-code-schema` repository is useful for versioned configuration, environment-variable, CLI-option, global-config, and keybinding evidence. It is not a schema for saved session/transcript JSONL. Tracks must not use it as proof of session record structure. Session behavior is established from sanitized fixtures, structure-only local inspection, Claude Code behavior, and future first-party documentation when available.

Reference:

- [claude-code-schema repository](https://github.com/amitray007/claude-code-schema)
- [latest reviewed release](https://github.com/amitray007/claude-code-schema/releases/tag/v2.1.211)

## Source-shape and scale assumptions

The repository does not include inventories or payloads from a contributor's local Claude data. Performance and discovery work use sanitized or synthetic cases that model:

- Thousands of JSONL files.
- Multi-gigabyte source trees.
- Individual JSONL files around 100 MB.
- Ordinary sessions alongside nested and related agent storage.

These are engineering test bounds, not product telemetry or claims about any user's machine.

### Discovery rule

The Claude adapter must identify supported source classes deliberately. It must not recursively treat every `*.jsonl` below the entire Claude configuration directory as a session.

- Project session discovery begins from the known Claude projects source.
- Top-level prompt history is a separate source class and is excluded from the track library unless a later feature explicitly uses it.
- Plugin-owned JSONL is not ingested by the Claude session adapter merely because of its extension.
- Nested session/sub-agent layouts are recognized through fixtures and path/record evidence, not path depth alone.

## Observed record families

The structure-only sample contained these top-level record families:

- `user`
- `assistant`
- `system`
- `ai-title`
- `attachment`
- `file-history-snapshot`
- `file-history-delta`
- `permission-mode`
- `mode`
- `queue-operation`
- `last-prompt`
- `pr-link`

The sample also contained non-session history rows without a top-level `type`, reinforcing the need for source-class detection before record parsing.

Observed message content block families included:

- `text`
- `thinking`
- `tool_use`
- `tool_result`
- `fallback`

Observed tool invocation blocks used structural fields equivalent to an invocation ID, name, input, type, and sometimes caller evidence. Tool result blocks referenced the invocation ID, contained either string or array content, and sometimes carried an explicit error flag.

Frequently observed optional evidence included UUID/parent UUID, session ID, agent ID, sidechain state, timestamps, version, working directory, git branch, request/prompt IDs, source-tool relationships, tool-use result metadata, and attribution for agents, MCP tools, plugins, or skills. None of these fields is assumed to exist on every row.

## Initial normalization map

| Claude evidence | Tracks canonical fact | Notes |
| --- | --- | --- |
| `user` message with text/content blocks | User message | Preserve provider record kind, IDs, parent, and timestamp |
| `assistant` text block | Assistant message | Model/usage are enrichment only when present |
| `thinking` block | Reasoning entry | Availability and redaction remain explicit |
| `tool_use` block | Tool call | Preserve exact Claude tool name and input; categorize by meaning |
| `tool_result` block | Tool result | Relate by tool-use ID; content may be string or structured blocks |
| Complete `<task-notification>` user record | Agent tool result | Claude emits completed background-task output as a synthetic user string. Parse only the complete, allowlisted wrapper; relate it to its `tool-use-id` when present, expose summary/result/usage as agent evidence, and never render the wrapper as user prose. Unknown or malformed XML remains untouched. |
| File-history snapshot/delta | Artifact/file evidence or unsupported entry | Do not claim a user-visible file change until semantics are validated |
| Agent/sidechain relationship evidence | Sub-agent relation or provider extension | Validate identity across nested files before creating child tracks |
| Mode, permission, queue, title, PR-link records | Status/metadata/unsupported according to proven meaning | Retain raw evidence state and exact record kind |
| Unknown valid record | Unsupported entry | Never silently discard |

This table is a starting hypothesis for fixtures and conformance tests. It is not a frozen schema declaration.

## CLI capability evidence

Claude Code `2.1.211` exposes capabilities relevant to future Tracks handoffs and status interpretation:

- Resume/continuation through `--continue`, `--resume`, `--session-id`, `--fork-session`, and `--from-pr`.
- Named sessions through `--name`.
- Background agents through `--background` and the `agents` command.
- Streaming JSON input/output, partial messages, hook events, and forwarded sub-agent text in print mode.
- An explicit `--no-session-persistence` mode, meaning not every Claude run is discoverable later.

Tracks does not execute or resume Claude in the viewer MVP. These flags inform capability labels and a later explicit handoff design.

## Live-state interpretation

File activity proves that source evidence changed; it does not by itself prove that a Claude process is still alive.

The UI distinguishes:

- **Live:** the source is currently producing/reconciling new records.
- **Running:** provider evidence explicitly says work is running, or a separately validated process integration proves it.
- **Recently active:** source revision changed within a defined window, without stronger liveness evidence.
- **Complete/failed/cancelled:** supported by provider lifecycle evidence.
- **Unknown/stale:** no reliable terminal or process evidence is available.

The first adapter should prefer “live” or “recently active” over falsely reporting “running.”

## Fixture program

Before claiming Claude Code MVP coverage, commit sanitized or deterministic fixtures for:

1. User/assistant text.
2. Thinking availability and redaction.
3. Tool use with string result.
4. Tool use with array/structured result.
5. Tool failure.
6. Attachment references.
7. File-history snapshot and delta.
8. Mode and permission changes.
9. Queue operations and partial tails.
10. Nested/sidechain/sub-agent evidence.
11. PR links and session titles.
12. Unknown and malformed records.
13. Append, rewrite, compaction, and moved-file identity.
14. A generated corpus with thousands of sessions and a 100 MB track.

Every fixture records the observed Claude Code version and the expected canonical facts, unsupported entries, capabilities, diagnostics, and raw-evidence states.
