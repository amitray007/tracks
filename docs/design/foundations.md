# Design foundations

## Product personality

Tracks is a professional developer tool with four personality traits:

- **Calm:** neutral surfaces, limited accent color, and no decorative activity.
- **Precise:** paths, timestamps, provider identity, event status, and causality are never visually ambiguous.
- **Fast:** common actions are close to the content, keyboard-accessible, and immediate.
- **Curious:** raw details remain available for users who want to understand what the agent actually did.

It should not feel playful, chatty, corporate, or like an analytics dashboard. The closest metaphor is a well-designed code review tool combined with a chronological lab notebook.

## Visual hierarchy

Use these signals in order:

1. Spatial position and indentation.
2. Typography family, weight, and brightness.
3. Borders and surfaces.
4. Icons and status shapes.
5. Color.
6. Motion.

Color or animation must never be the only way to identify an event or state.

## Design tokens

The following values are proposed starting points. They should live as semantic CSS variables; components must not copy literal values.

### Typography

| Token | Value | Use |
| --- | --- | --- |
| font-sans | Inter Variable, Geist Sans, system sans-serif | Interface and narrative prose |
| font-mono | Geist Mono, IBM Plex Mono, ui-monospace | Code, paths, IDs, timestamps, output |
| text-2xs | 11px / 16px | Rare compact counters and badges |
| text-xs | 12px / 16px | Labels, timestamps, metadata |
| text-sm | 13px / 20px | Dense rows and tool summaries |
| text-base | 14px / 21px | Transcript prose and controls |
| text-lg | 16px / 24px | Session title and section heading |
| text-xl | 20px / 28px | Empty-state or onboarding heading |

Use font weights 400, 500, and 600. Reserve 600 for titles and strong status; large areas of bold text reduce hierarchy. Code should default to 400, with changed tokens or selected lines using weight sparingly.

### Spacing

Tracks uses a 4px base unit with a limited half-step for optical alignment.

| Token | Value |
| --- | --- |
| space-0.5 | 2px |
| space-1 | 4px |
| space-1.5 | 6px |
| space-2 | 8px |
| space-3 | 12px |
| space-4 | 16px |
| space-5 | 20px |
| space-6 | 24px |
| space-8 | 32px |
| space-10 | 40px |
| space-12 | 48px |

Repeated transcript spacing should use 8, 12, 16, or 24px. One-off values require a comment or token proposal.

### Shape

| Token | Value | Use |
| --- | --- | --- |
| radius-sm | 4px | Badges and compact controls |
| radius-md | 6px | Rows, inputs, small popovers |
| radius-lg | 8px | Cards, tool bodies, menus |
| radius-xl | 12px | Dialogs and empty-state panels |
| border-width | 1px | Standard separation |

Transcript components should not all become rounded cards. Use a surface only when the content has an independent boundary, such as a tool result, diff, code block, warning, or selection.

### Dark theme proposal

| Semantic token | Proposed value | Purpose |
| --- | --- | --- |
| background | #111315 | Application background |
| foreground | #e6e8eb | Primary text |
| surface-1 | #16191c | Subtle grouping |
| surface-2 | #1d2125 | Cards and controls |
| surface-3 | #262b30 | Hover and elevated surfaces |
| inset | #0a0c0e | Code and terminal output |
| border | #282d32 | Default boundary |
| border-strong | #3a4148 | Selected or emphasized boundary |
| text-muted | #9da4ac | Secondary text |
| text-faint | #707881 | Tertiary metadata |
| accent | #8aa4ff | Focus, selection, and active navigation |
| focus-ring | #9db2ff | Keyboard focus outline |
| success | #72c995 | Completed state |
| warning | #e7b86a | Partial or attention state |
| danger | #ef7e82 | Error and destructive state |

This palette intentionally differs from the Traces reference. Values should be tested in context and adjusted to meet contrast requirements.

### Event semantics

Event tokens are accents, not large background fills.

| Event | Icon concept | Accent role |
| --- | --- | --- |
| User message | Message bubble | Identity marker and outline filter |
| Assistant message | Spark or agent mark | Identity marker |
| Reasoning | Brain or thought path | Faint marker; optionally hidden |
| Tool call | Wrench | Disclosure and timeline marker |
| Command | Terminal square | Command header and status |
| Search/read | Search or file-search | Tool subtype |
| File change | Pen or file-plus | Diff header and outline |
| Sub-agent | Branch or bot | Nested execution boundary |
| Error | Alert circle | Status and actionable message |

Provider color must not replace event color. A Claude Code tool call and a Codex tool call should still look like the same canonical event type.

### Icon system

Hugeicons Free Stroke Rounded is the initial Tracks family. Its React renderer and free icon data package sit behind a shared semantic `Icon` component; they are never imported directly by transcript, navigation, or feature components.

| Token | Size | Use |
| --- | --- | --- |
| icon-xs | 12px | Dense metadata; only when the shape remains clear |
| icon-sm | 14px | Filters, inline status, and compact navigation |
| icon-md | 16px | Default controls, event markers, and row actions |
| icon-lg | 20px | Sparse primary actions and empty states |

Use `currentColor` and a 1.5px default stroke, with optical exceptions owned by the registry. Icons do not carry provider-specific meaning or become the only signal for state. Meaningful icon-only controls require an accessible name; decorative icons are hidden from assistive technology.

The initial audit must cover message, assistant, reasoning, tool, command, terminal output, search/read, file change, sub-agent, error, warning, success, project, session, share, link, copy, filters, layout modes, disclosure, and navigation. A candidate passes only if this vocabulary remains coherent at Tracks' compact sizes, used exports tree-shake correctly, all assets ship locally, and the pinned package terms are compatible with distribution. Mixing general-purpose icon families per component is not allowed.

## Elevation

Prefer border and surface changes to shadows in the main transcript. Shadows are reserved for overlays that physically float over content:

- Popovers: subtle 0 8px 24px shadow plus a border.
- Command palette: 0 16px 48px shadow plus a stronger border.
- Dialogs: centered elevation with a scrim.
- Sticky rails: border separation, not a continuous shadow.

## Layout system

### Global shell

- Compact header: 40–44px.
- Left and right page gutters: 16px narrow, 24px medium, 32px wide.
- Main transcript width: 760–880px depending on the active inspection mode.
- Readable prose inside the transcript: maximum 72–88 characters per line.

### View compositions

Tracks defines named compositions rather than letting each screen invent a grid:

| Mode | Wide composition | Primary purpose |
| --- | --- | --- |
| Library/project | Centered results with optional source/filter rail | Find sessions and review a project scope |
| Compact track | 720–780px narrative plus 280–320px context rail | Understand the session quickly |
| Full track | 208–240px filter/outline rail plus 820–880px chronology | Inspect every canonical entry and evidence state |
| Raw/inspection | 720–880px selected content plus 280–360px inspector | Debug normalization/provider payloads |
| Share preview | Export-sized compact/full shell plus inclusion/redaction panel | Verify exactly what another viewer receives |

Use approximately 48–64px between a persistent rail and the reading column on expansive layouts. The exact value should respond to available width, but the rail and transcript must not appear as one undifferentiated panel.

Compact view is not a smaller font or a lossy transcript. It uses the same base reading typography, stable anchors, and renderer contracts while grouping related tool facts, collapsing low-signal output, and foregrounding the narrative. Full view restores every canonical and unsupported entry. Both views default to chronological provider order and may reverse the presentation when the user selects latest-first; canonical sequence remains unchanged.

### Breakpoints

Breakpoints describe layout behavior rather than device brands:

| Name | Width | Behavior |
| --- | --- | --- |
| compact | Below 640px | One column; rails become sheets or menus |
| medium | 640–1023px | One main column with optional overlay panels |
| wide | 1024–1439px | Main column plus one persistent rail |
| expansive | 1440px and above | Main column plus filter and metadata rails when useful |

### Scroll ownership

- The workspace owns the primary session scroll, while the session library owns a separate contained list scroll so wheel and touch input never move both surfaces together.
- Popovers, dialogs, command palette results, and very large raw payloads may own internal scroll regions.
- Avoid nested vertical scroll areas inside normal entries.
- Sticky controls must not cover anchored content when navigating by URL or keyboard.
- Expanding an entry must preserve the user's visual anchor.

## Density

The initial release should ship one polished density. A future compact preference may reduce vertical padding but must not change typography below accessible sizes or shrink pointer targets on touch devices.

Suggested dimensions:

| Element | Desktop |
| --- | --- |
| Compact icon button | 28–32px visible control, with accessible hit area |
| Input/button | 32–36px |
| Transcript row minimum | Content-driven; usually at least 32px |
| Touch control | At least 44px hit area |
| Rail width | 208–240px |
| Metadata rail | 280–320px |

## Content rules

- Preserve provider text exactly in raw mode.
- Normalize typography and safe Markdown only in reading mode.
- Never silently omit unsupported provider data; summarize it as an unsupported entry with access to the raw payload.
- Long paths use middle truncation while preserving filename and extension. Full value appears on focus/hover and is copyable.
- Timestamps display relatively in the transcript and absolutely in accessible labels or details.
- Commands never use typographic quotation marks or ligatures that obscure exact input.
- Sensitive values may be visually redacted, but the interface must indicate that redaction occurred.

## Responsive degradation

On narrow screens:

- Hide persistent rails before narrowing the transcript below readability.
- Move filters into a bottom sheet or full-height panel.
- Replace multi-column metadata with stacked definition rows.
- Default diffs to unified mode.
- Allow horizontal scrolling for exact commands and code; offer an explicit wrap toggle.
- Keep the session title, provider, status, and primary navigation visible.

Responsive design is complete only when tested with long filenames, deeply nested tools, large font settings, and on-screen keyboards.
