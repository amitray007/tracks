# Traces reference audit

## Purpose and limits

This document records reusable lessons from the public Traces interface for the design of Tracks. The audit covers public DOM structure, computed styling, asset names, production-bundle fingerprints, responsive behavior, and visible interaction states.

This is not a source-code audit. Exact dependency versions and internal architecture cannot be proven without a package manifest or source maps. Findings are therefore marked as Observed, Inferred, or Proposed.

Reference inspected: [public Traces example](https://traces.com/s/jn77gd678jcnkz347z43fa9ky58a3t6c/full)

## Executive summary

Traces succeeds because it treats an agent session as a technical document rather than a chat transcript. It combines a narrow reading column, quiet surrounding surfaces, a consistent event taxonomy, compact controls, specialized Markdown and diff renderers, and restrained motion.

The most valuable lessons for Tracks are:

- Give messages, reasoning, tool calls, command output, and file changes distinct but related anatomy.
- Keep the chronological narrative readable while moving filters and metadata into secondary rails.
- Use low-contrast surfaces and reserve strong color for meaning.
- Prefer specialized renderers for Markdown, syntax highlighting, and diffs instead of forcing every event into one generic card.
- Make disclosure, copying, filtering, and keyboard navigation feel immediate.
- Treat enormous tool results and diffs as first-class performance cases.

## Live verification — 2026-07-16

The public reference trace was re-inspected at a 1280×720 CSS viewport on 2026-07-16. These measurements update the earlier approximate audit and are evidence about the current reference, not values Tracks must copy:

| Surface | Observed current behavior |
| --- | --- |
| Global navigation | 40px fixed bar |
| Trace identity/tabs region | Approximately 141px below navigation; tabs occupy a 40px row |
| Full Trace | 220px left filter rail, approximately 64px gap, 870px transcript |
| Highlights/compact | 770px narrative, approximately 64px gap, 320px right metadata rail |
| Transcript top inset | 24px on desktop |
| Repeated event rhythm | Commonly 24px vertical margins |
| Timeline/content inset | Approximately 36–46px depending on event anatomy |
| Base typography | Inter at 14px/20px |
| Compact user message | Subtle independent surface with approximately 6px vertical and 10px horizontal padding |
| Command/terminal blocks | Dark inset surface with approximately 6px vertical and 10px horizontal padding |

The key lesson is that full and compact are intentionally different compositions, not the same column with entries hidden. Full Trace gives more width to chronology and a narrow filter rail. Highlights gives a narrower reading document and a wider contextual rail. Tracks should adopt this mode-specific composition while establishing its own palette, typography details, icons, and sharing workflow.

## Identified frontend stack

| Layer | Finding | Status | Relevance to Tracks |
| --- | --- | --- | --- |
| Application | React and Next.js assets built with Turbopack | Observed | Tracks can use React without requiring Next.js for a localhost application. |
| Styling | Tailwind CSS with v4-style generated output | Observed; exact version inferred | A constrained utility and token system suits a dense interface. |
| Interaction primitives | Radix UI Primitives | Observed | Use for focus-managed popovers, menus, dialogs, tabs, and tooltips. |
| Interface icons | Lucide; probably lucide-react | Observed family; adapter inferred | Reference evidence only. Tracks does not inherit this dependency and uses its own semantic icon system. |
| Notifications | Sonner | Observed | Suitable for import, copy, parse, and indexing feedback. |
| Command UI | cmdk | Observed | Suitable for session search and a global command palette. |
| AI Markdown | Streamdown | Observed | Handles streaming and incomplete AI Markdown. |
| Markdown pipeline | unified, remark, and rehype plugins | Observed in bundles; may be transitive | Useful for controlled transformations and sanitization. |
| Highlighting | Shiki | Observed | Provides TextMate/VS Code-quality code rendering. |
| Diffs | @pierre/diffs | Observed | Purpose-built renderer for file edits and code review interactions. |
| Class composition | clsx and tailwind-merge style composition | Observed in shipped bundles | Keep one class-composition helper in Tracks. |
| Documentation | Fumadocs styles and tokens | Observed | Likely route-specific; not required by the viewer. |
| Motion framework | Framer Motion not identified | Not observed | Prefer CSS transitions for predetermined UI motion. |

Relevant upstream documentation:

- [Lucide](https://lucide.dev/)
- [Hugeicons React](https://hugeicons.com/docs/integrations/react/overview)
- [Radix UI Primitives](https://www.radix-ui.com/primitives/docs/overview/introduction)
- [Sonner](https://github.com/emilkowalski/sonner)
- [cmdk](https://github.com/dip/cmdk)
- [Streamdown](https://github.com/vercel/streamdown)
- [Shiki](https://shiki.style/guide/)
- [Diffs, from Pierre](https://diffs.com/)
- [Tailwind CSS](https://tailwindcss.com/docs/styling-with-utility-classes)

## Information architecture

### Observed screen structure

    Application shell
    ├── compact global navigation
    ├── trace header
    │   ├── identity and metadata
    │   └── share, refresh, and view controls
    ├── view tabs
    └── trace workspace
        ├── event filter rail
        ├── chronological transcript
        └── optional metadata or outline rail

The transcript remains the visual center. Filters and metadata are available but do not split the narrative into a dashboard of equally weighted panels.

### Observed layouts

| Context | Measurement or behavior |
| --- | --- |
| Top navigation | Approximately 40px high |
| Library container | Approximately 976px maximum width |
| Library grid | Two columns around 474px with a 28px gap |
| Library narrow mode | One column below approximately 768px |
| Highlight view | Roughly 770px transcript plus a 320px metadata rail |
| Full trace view | Roughly 220px filter rail plus an 870px transcript |
| Desktop rails | Appear at approximately the 1024px breakpoint |
| Sticky offset | Secondary rails begin around 76px from the top |

### Proposed lesson

Tracks should implement layout modes, not one infinitely flexible grid:

1. **Library mode** for finding and comparing sessions.
2. **Reading mode** for a focused chronological track.
3. **Inspection mode** with filters, outline, and metadata rails.
4. **Raw mode** for provider payload debugging.

The active mode should be URL-addressable and restorable.

For Tracks, the compact mode is deterministic rather than dependent on an opaque AI summary: it groups related tool mechanics, collapses large evidence, foregrounds user/assistant narrative, files, commands, and failures, and always links back to the corresponding full entries.

## Typography

### Observed

- Inter Variable is used for interface text and prose.
- Berkeley Mono Regular and Bold are used for code, paths, identifiers, timestamps, and tool output.
- General text is commonly around 14px with a 20px line height.
- Metadata and tool rows are commonly around 13px with a 20px line height.
- Compact labels are commonly around 12px with a 16px line height.
- Hierarchy relies more on placement, brightness, weight, and font family than on large heading sizes.

### Proposed Tracks choice

- Use Inter or Geist Sans for interface and prose.
- Use Geist Mono, IBM Plex Mono, or JetBrains Mono instead of the commercial Berkeley Mono unless the project licenses it.
- Keep transcript prose between 13px and 15px depending on density setting.
- Limit readable prose to approximately 72–88 characters per line.
- Preserve whitespace in commands and output, but let users toggle wrapping.

## Color and surfaces

### Observed approximate dark palette

| Token | Value |
| --- | --- |
| Page background | #141414 |
| Primary foreground | #e2e2e2 |
| Card surface | #242424 |
| Elevated surface | #333333 |
| Muted surface | #111111 |
| Inset/code surface | #070707 |
| Muted text | #9b9b9b |
| Faint text | #737373 |
| Subtle border | #202020 |

The palette uses a narrow luminance range. Elevation comes from small brightness changes rather than dramatic shadows. Strong colors are reserved for focus, status, event semantics, and diff additions/deletions.

### Proposed lesson

Copy the contrast strategy, not the exact palette. Tracks should have a distinct neutral family and accent color. Semantic event colors must remain understandable when color is absent by pairing color with icon, label, shape, indentation, or border treatment.

## Iconography

### Observed system

Lucide icons use rounded caps and joins, usually at 2–2.25px stroke width. Icons inherit surrounding color and are sized according to hierarchy.

| Context | Typical size |
| --- | --- |
| Compact navigation and metadata | 12px |
| Filters and event types | 14px |
| Tabs and primary row actions | 16px |
| Larger standalone actions | Approximately 16–20px |

Observed icons include:

- Navigation: ChevronsUpDown, Terminal.
- Trace actions: Link2, Globe, ChevronDown, RefreshCw.
- Tabs: List plus a custom Lucide-style trace glyph.
- Filters: MessageSquare, Brain, Wrench, Pen, FilePlus, SquareChevronRight.
- Summary stages: Hammer, Cog, SearchCheck.
- Utilities: Copy, Check, ArrowDown, ChevronRight.

Provider and model logos are custom assets, not Lucide icons.

### Proposed Tracks rule

The Lucide usage above is a description of the Traces reference, not a dependency recommendation for Tracks.

Use Hugeicons Free Stroke Rounded as the initial Tracks family through `@hugeicons/react` and `@hugeicons/core-free-icons`. Put it behind one semantic `Icon` registry with fixed size, color, and stroke defaults. Components ask for a meaning such as `tool`, `reasoning`, `command`, `fileChange`, `share`, or `error`; they never import a package glyph directly.

The registry is the stable product contract and the underlying family remains replaceable. Before locking versions, audit the free set against every required semantic concept, small-size legibility, bundle output, React/Vite behavior, accessibility, and the exact installed-package license. Do not mix a second general-purpose icon family into the UI to fill isolated gaps. Prefer a reviewed custom glyph that matches the system, or revisit the family centrally.

Provider logos are separately reviewed brand assets. They may appear in session identity and source filters, but canonical events always use provider-neutral icons.

## Component language

### Observed components

- Compact application navigation.
- Dataset or workspace selector.
- Session library cards.
- Trace identity header and metadata badges.
- Reading/full-trace tab pair.
- Sticky event filter rail.
- Summary phases.
- User and assistant message blocks.
- Reasoning/thinking blocks.
- Expandable tool-call rows.
- Command and result blocks.
- File creation/edit rows.
- Large diff viewer using a custom diffs-container element.
- Copy, share, refresh, and jump actions.
- Popovers, menus, tooltips, dialogs, and toast notifications.

The components are related by typography, spacing, borders, and disclosure behavior, but they are not forced into one universal card shape.

### Proposed lesson

Tracks needs a common EntryFrame for chronology, selection, nesting, anchors, and status. The content renderer inside it should be type-specific. This preserves consistent navigation without flattening unlike data into a generic card.

## Motion

### Observed timing

| Interaction | Approximate duration |
| --- | --- |
| Popover | 100ms |
| Cards, tabs, and tool rows | 150ms |
| Navigation color | 200ms |
| Sidebar/panel | 250ms |
| Dialog | 300ms |

Disclosure chevrons rotate while increasing opacity. Copy actions replace the copy glyph with a check. Most hover states alter only background, border, foreground, or opacity. No strongly springy interaction language was observed.

### Proposed lesson

Frequently repeated keyboard actions should be immediate. Animate only state continuity, anchored overlays, disclosure, and completion feedback. Large transcript regions and diff height changes should not be tweened.

See [Motion and interaction](motion.md) for Tracks-specific rules.

## Accessibility evidence

Observed bundles and DOM include:

- Radix focus guards and popper positioning variables.
- ARIA-expanded on disclosures.
- ARIA-selected on tabs.
- Focus-visible outlines.
- Decorative Lucide icons hidden from assistive technology unless labeled.
- A notification region consistent with Sonner.

This suggests an accessibility-aware primitive layer, but it does not prove complete keyboard, contrast, or screen-reader quality. Tracks must perform its own testing rather than inheriting confidence from its dependencies.

## Performance risks

Expanding a file change of roughly 1,000 lines produced a document more than 20,000px tall during inspection. Even a capable diff component cannot protect the full page if every large result is eagerly mounted.

Tracks should therefore:

- Collapse large tool results and diffs by default.
- Render collapsed hunk summaries.
- Virtualize the chronological entry list.
- Avoid syntax-highlighting content outside the viewport.
- Offload expensive highlighting or diff parsing to a worker.
- Preserve scroll anchoring when live entries arrive or blocks expand.
- Offer “open full result” rather than placing all content in the main transcript.

## What Tracks should emulate

- Quiet, transcript-centered composition.
- Distinct event anatomy.
- Compact but readable typography.
- Purpose-built Markdown and diff rendering.
- Low-chroma surfaces with semantic accents.
- Sticky filters and metadata that do not interrupt reading.
- Small, consistent iconography.
- Restrained interaction motion.

## What Tracks should deliberately change

- Establish its own name, logo, accent colors, radii, and provider-neutral event glyphs.
- Make local source and privacy state more explicit.
- Provide clearer parse-error and unsupported-event states.
- Treat multiple providers as a primary navigation concept.
- Add stronger virtualization and large-session controls.
- Make raw provider payloads inspectable for adapter development.
- Support density and wrapping preferences without exposing unlimited theme configuration.

## Audit artifacts to maintain

Future reference audits should capture:

- Full-page and component screenshots at 1440px, 1024px, 768px, and 390px.
- Computed font, color, spacing, radius, border, and shadow values.
- An icon registry with package match, size, stroke, and context.
- A component/state inventory.
- Frame-by-frame recordings for nontrivial motion.
- Focus order and keyboard behavior.
- Empty, error, loading, partial, and enormous-content states.
- Network assets and library fingerprints, separated into direct evidence and inference.
- Performance traces for long transcripts and expanded diffs.

The audit should be updated when a reference product materially changes, not used as a one-time frozen specification.
