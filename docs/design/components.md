# Components and interaction states

## Component architecture

Tracks should separate chronological structure from provider-specific content:

    TrackViewport
    ├── TrackOutline
    ├── EntryList
    │   └── EntryFrame
    │       ├── EntryMarker
    │       ├── EntryHeader
    │       ├── type-specific EntryRenderer
    │       └── EntryActions
    └── TrackInspector

EntryFrame owns anchoring, selection, nesting, status, timestamps, keyboard navigation, and common actions. An EntryRenderer owns the content for one canonical entry kind. Provider adapters must not inject arbitrary interface components into this layer in the first release.

The current product implementation uses Claude Code fixtures only. Components are provider-neutral because they consume canonical view models, not because they attempt to anticipate every future provider screen.

## Component data contract

Every data-bearing component defines two inputs:

1. A **minimum renderable shape** containing identity, canonical kind, sequence, status/summary as applicable, and stable actions.
2. **Optional enrichment** such as duration, model, usage, arguments, result body, diff, raw evidence, or provider metadata.

Optional enrichment must never be dereferenced without an availability check. Components share one availability vocabulary:

| State | UI behavior |
| --- | --- |
| Loading | Preserve layout with a small local placeholder; do not replace the whole page |
| Available | Render the enrichment and its applicable actions |
| Partial | Render available content with a visible explanation of what is incomplete |
| Unavailable | Omit decorative space; show a concise explanation where the user expected the data |
| Redacted | Show a labeled redacted region without revealing indexed or raw content |
| Stale | Keep the canonical summary but disable misleading raw/detail retrieval |
| Failed | Keep the surrounding entry usable and expose a retry/detail action when meaningful |
| Unknown/unsupported | Render a provider-neutral fallback with exact provider terminology in inspection details |

The distinction between “the provider does not support this,” “this session did not contain it,” and “Tracks failed to parse it” must remain visible. An unavailable enrichment is not an error boundary for the whole entry.

### Presentation normalization

Entry renderers consume Tracks-owned view models such as `ToolInvocationView`, `CommandView`, and `FileChangeView`. A view model may be produced from different canonical facts—for example, a categorized tool call/result pair or a direct command record. This allows future adapters to use different terminology and record shapes without adding provider conditions to components.

Provider-specific names remain available in labels and the inspector, but provider packages do not choose component structure, icons, spacing, or behavior.

## Content-scale behavior

Components support data size independently from viewport size:

| Scale | Default treatment |
| --- | --- |
| Empty or tiny track | Center the narrative and avoid empty rails or oversized whitespace |
| Short track | Render directly while preserving the same anchors and keyboard model as long tracks |
| Long track | Load/window entries around stable anchors and preserve selection during pagination |
| Active or unbounded track | Follow only at the live tail; otherwise show a new-entry affordance |
| Huge entry body | Render a bounded summary/preview and retrieve the artifact on explicit expansion |
| Narrow viewport | Move rails to overlays and actions to menus without removing functionality |
| Wide viewport | Add persistent outline/inspector rails while retaining a readable transcript width |

No renderer assumes that the complete track, result, raw payload, or diff is present in memory. Empty, short, and long tracks use the same semantic structure so switching to pagination or virtualization does not change deep links, focus behavior, or accessibility labels.

## Screen-level components

### AppShell

Responsibilities:

- Global navigation and active source context.
- Indexing/live-update status.
- Command palette trigger.
- Settings and privacy access.
- Stable focus landmarks and skip links.

The shell remains visually quiet. It does not show aggregate charts unless a later user need justifies them.

### SessionLibrary

Primary job: locate the session a user wants to inspect.

Required controls:

- Search across title, project, path, message text, tool names, and model.
- Filter by provider, project, date, status, and tags.
- Sort by last activity, start time, duration, or relevance.
- Switch between list and compact card layout if both prove useful.
- Explain indexing or parsing gaps.

Session result anatomy:

- Provider mark and provider name.
- Derived or provider-supplied title.
- Project/repository and working directory.
- Start time, duration, and last activity.
- Model and optional branch.
- Counts for messages, tool calls, file changes, and errors.
- Live, complete, partial, or failed status.

### ProjectLibrary

ProjectLibrary groups local sessions by stable project identity and is the starting point for project-scoped sharing.

- Shows project identity, source-health summary, track counts, last activity, providers, and errors without exposing absolute paths by default.
- Supports list/card density based on viewport, not a separate data contract.
- Lets the user enter review-selection mode and choose exact session revisions for a share snapshot.
- Newly discovered sessions are visually separate from an existing saved share selection until reviewed.
- Large projects paginate/window results and keep selection stable across search/filter changes.

### TrackViewSwitcher

The primary track modes are **Compact** and **Full**. **Raw/Inspect** is a secondary developer mode rather than a peer reading mode.

- The selected mode is URL-addressable.
- Switching preserves the selected canonical entry or moves to the nearest containing group with an explanation.
- Counts make hidden/grouped mechanics legible in Compact view.
- The control uses a stable tab/segmented treatment and does not move when session actions change.

### CompactTrackView

Compact view is a deterministic narrative projection:

- Foregrounds user prompts, assistant narrative, meaningful reasoning availability, changed files, important commands, failures, and completion state.
- Groups a tool call/result and directly related file/command evidence into one compact unit when relations are reliable.
- Collapses repeated low-signal reads/searches and enormous successful output into labeled count/summary rows.
- Never invents a summary or hides an error/unsupported entry without an explicit compact marker.
- Every group/collapse action links to the corresponding full entries.
- Uses a narrower reading column and a contextual right rail on wide layouts.

### FullTrackView

Full view renders every canonical entry in provider order:

- Uses a left filter/outline rail on wide layouts and an 820–880px chronology.
- Preserves unsupported, parse, partial, status, and provider-specific evidence markers.
- Applies progressive disclosure within entries but does not remove entries from chronology unless the user activates a filter.
- Is the authoritative destination for cross-view evidence links.
- Supports active/open-ended tracks through stable windowing and follow-tail behavior.

### TrackHeader

Contains identity and actions that apply to the whole track:

- Session title and optional rename/alias.
- Provider, model, project, branch, and time range.
- Source file/directory disclosure.
- Refresh/reparse, copy link, export, and open source location.
- Parse warnings or capability limitations.

Local links should use stable Tracks IDs rather than exposing raw absolute paths in the URL.

### TrackFilters

Filters operate on canonical event kinds, not provider names. They support:

- User, assistant, reasoning, tools, commands, file changes, sub-agents, errors.
- Text search within the current track.
- “Only failures,” “only changed files,” and “hide reasoning” quick filters.
- A visible count and active state for each category.
- Clear-all from keyboard and pointer.

Filtering should not destroy scroll position. When the selected entry is filtered out, move selection to the nearest visible entry and announce the change.

### TrackInspector

Displays secondary information for the selected entry or whole track:

- Exact timestamp and duration.
- Provider event type and raw ID.
- Model, token usage, and cost when supplied.
- Parent tool/sub-agent relationship.
- Source file and byte offsets when available.
- Raw normalized object and provider payload.

The inspector is persistent on wide screens and an overlay on narrower screens.

Raw and normalized sections each support available, redacted, stale, unavailable, and failed states. The inspector does not show an empty JSON tree or a broken disclosure when an adapter cannot supply raw evidence.

### ShareFlow

ShareFlow is a full-screen or large-dialog workflow shared by session and project contexts:

1. Scope and exact revision selection.
2. Compact/full default and inclusion categories.
3. Redaction findings and manual exclusions.
4. Generated static preview.
5. Download or explicit publisher target.
6. Result with local/hosted label, visibility, copy link, and update/revoke status.

The preview renders the generated bundle in an isolated frame/origin with the same CSP and assets the recipient will receive. It does not preview a privileged local page and then export different data.

Required states include scanning, findings available, user review required, generating, generated, preview failed, publisher authentication required, uploading, published, update available, remote deletion pending, and revoked.

### ProjectSharePage

The exported project surface contains:

- Project title/description and explicit snapshot timestamp.
- Session search/filter/sort over only exported data.
- Session cards with model/provider/status/counts as available.
- Compact/full per-session navigation.
- A provenance/redaction statement without local source paths.
- Empty and partial states when selected sessions lack optional data.

## Entry components

### EntryFrame

Required states:

| State | Visual behavior | Accessibility behavior |
| --- | --- | --- |
| Default | Quiet marker and metadata | Reachable by entry navigation commands |
| Hover | Reveal secondary actions | Hover is not required to discover the action by keyboard |
| Focused | Strong visible focus indicator | Announces entry kind, position, and summary |
| Selected | Persistent accent/border treatment | Inspector references selected entry |
| Nested | Indentation and connecting guide | Announces parent relationship |
| Running | Status label and subtle progress indicator | Live state announced politely once |
| Partial | Warning status with explanation | Describes missing or incomplete data |
| Failed | Error icon, label, and detail | Error text is not color-only |

Every entry has a stable anchor and supports copy-link.

### MessageEntry

Variants: user, assistant, system, and provider notice.

- User content should be visually identifiable without using a speech-bubble imitation.
- Assistant Markdown uses the standard prose renderer.
- System/provider notices are compact and lower emphasis.
- Extremely long messages may offer an outline but should not be collapsed without a clear indication.

### ReasoningEntry

- Hidden or summarized by default when the provider marks content as sensitive or unavailable.
- Clearly labeled as reasoning/thinking rather than ordinary assistant output.
- Supports collapsed, expanded, unavailable, and redacted states.
- Never invents reasoning when an adapter cannot provide it.
- Search results may indicate a reasoning match without exposing hidden content unexpectedly.

### ToolCallEntry

Anatomy:

- Disclosure chevron.
- Canonical tool icon and type.
- Human-readable summary.
- Running/completed/failed status.
- Duration.
- Compact argument preview.
- Expandable request, result, and provider metadata.

Required variants include file read/search, web request, command, file edit/create, task/sub-agent, generic structured tool, and unsupported tool.

The summary is adapter-produced structured data, not a lossy string baked into the canonical event. This allows the UI to render paths, line numbers, commands, and counts consistently.

### CommandEntry

- Show exact command in monospace.
- Distinguish command, stdout, stderr, exit code, and duration.
- Preserve ANSI semantics after sanitization; never execute terminal escape behavior.
- Offer wrap, copy, and open-full-result controls.
- Collapse output beyond a configured line/byte threshold.
- Indicate truncation performed by the provider separately from truncation performed by Tracks.

### FileChangeEntry

- Show operation: create, modify, delete, rename, or unknown.
- Display path, language, additions, deletions, and binary status.
- Default to unified diff in narrow layouts; allow split view when width permits.
- Collapse unchanged hunks and enormous files.
- Provide copy patch and open-full-diff actions.
- Clearly distinguish provider-supplied patches from Tracks-computed diffs.

### SubAgentEntry

- Establish a nested execution boundary with its own identity, status, and duration.
- Allow inline expansion for short work and dedicated-track navigation for long work.
- Preserve parent/child causality in URLs and keyboard navigation.
- Avoid recursively shrinking content width at deep nesting levels; after one visual indentation level, use labels and guides rather than continued horizontal indentation.

### ErrorEntry

- State what failed, where it came from, and whether the rest of the track is reliable.
- Separate provider errors, parser errors, source-read errors, and UI rendering errors.
- Offer retry/reparse only when the action is meaningful.
- Provide raw details behind disclosure without requiring them to understand the primary error.

### UnsupportedEntry

Unsupported provider data is visible, compact, and inspectable:

- Provider event name.
- Timestamp and approximate position.
- Explanation that Tracks has not normalized it.
- Raw payload disclosure.
- Copy-report action for adapter development.

## Content renderer components

### MarkdownRenderer

- Supports CommonMark/GFM expected from agent output.
- Handles incomplete streaming Markdown.
- Sanitizes HTML, URLs, images, and embedded content.
- Uses stable heading anchors scoped to the entry.
- Provides copy actions for code blocks without shifting layout.
- Defines table overflow behavior and narrow-screen fallbacks.

### CodeBlock

- Language label, copy action, optional filename, and wrap toggle.
- Shiki highlighting with lazy language loading.
- Line numbers only when they add reference value.
- Maximum initial height with explicit expansion for very long snippets.
- Plain-text fallback while highlighting loads or fails.

### DiffViewer

- Backed by @pierre/diffs/react unless implementation testing reveals a blocker.
- Unified and split layouts.
- Collapsed hunks and optional line wrapping.
- Worker-based highlighting/diff parsing for large inputs.
- Virtualized full-file mode.
- Accessible line information that does not require interpreting red/green backgrounds.

### StructuredDataViewer

- Collapsible object/array tree for tool arguments and raw payloads.
- Copy value, copy path, and expand-to-depth actions.
- Virtualization for large arrays.
- Safe rendering for cyclic, malformed, or very deep data.

## Navigation and utility components

### Icon

The shared `Icon` component accepts a semantic name, tokenized size, and whether it is meaningful or decorative. It resolves that name through the central registry, initially to Hugeicons Free Stroke Rounded, and owns `currentColor`, stroke width, optical corrections, and accessibility defaults.

Feature components do not import `@hugeicons/react`, `@hugeicons/core-free-icons`, or raw SVGs. Provider logos and rare reviewed custom glyphs use separate registries so they cannot silently change canonical event semantics. A missing registry mapping renders a safe development diagnostic and a neutral production fallback without breaking the surrounding row.

### CommandPalette

Primary commands:

- Search/open session.
- Jump to entry or changed file.
- Toggle event filters.
- Change reading/inspection/raw view.
- Copy current link.
- Re-index or reparse.
- Open settings and source location.

Opening and closing by keyboard is immediate. Results are grouped by sessions, entries, files, and actions. Search must expose why a result matched.

### Toasts

Use toasts for transient confirmation such as copied, export created, or re-index completed. Persistent errors and parse limitations belong in the screen, not only in a disappearing toast.

### Tooltip

- Initial pointer hover uses a short delay.
- Moving between adjacent toolbar icons after one tooltip is open is immediate.
- Tooltips never contain essential instructions unavailable elsewhere.
- Keyboard focus shows the same content.

### EmptyState

Required variants:

- No providers detected.
- Provider detected but no sessions found.
- Indexing in progress.
- Search has no matches.
- Filters hide every entry.
- Source is unavailable.

Each state identifies the cause and offers the smallest relevant next action.

## Provider-specific UI boundary

Adapters may supply:

- Provider name, logo, and optional accent.
- Capability declarations.
- Human-readable tool labels and structured summaries.
- Links to provider documentation.
- Raw metadata schemas for the inspector.

Adapters may not supply arbitrary React components, CSS, scripts, or HTML in the initial plugin model. This protects visual consistency, accessibility, performance, and local security.

## State coverage checklist

Every data-bearing component should be evaluated with:

| Data dimension | Fixtures |
| --- | --- |
| Length | Empty, one line, typical, 1,000 lines, and provider-truncated |
| Status | Waiting, streaming, complete, partial, failed, cancelled |
| Identity | Claude Code, Codex, unknown future provider |
| Text | Long unbroken strings, Unicode, RTL, emoji, invalid encoding |
| Path | Short, deeply nested, spaces, hidden files, outside project root |
| Nesting | Root, one child, deeply nested sub-agent |
| Rendering | Supported, unsupported, malformed raw payload |
| Data richness | Minimum valid shape, partially enriched, Claude-rich, unavailable raw evidence |
| Viewport | Compact, medium, wide, expansive |

## Component anti-patterns

- One generic card for every event type.
- Provider-specific event logic inside shared components.
- Actions visible only on hover.
- Color-only status or event identity.
- Eagerly rendering every diff and tool result.
- Nested scroll containers within ordinary transcript entries.
- Raw HTML from provider content.
- Disappearing errors shown only as toasts.
- Deep indentation that leaves no width for content.
- Copy buttons that move when their label changes to “Copied.”
