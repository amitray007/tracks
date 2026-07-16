# Accessibility and quality

## Quality target

Tracks targets WCAG 2.2 AA for its local web interface and treats keyboard operation as a primary workflow. Passing automated checks is necessary but insufficient; transcript navigation, code, diffs, streaming updates, and virtualized content require manual testing.

## Semantic structure

- Use header, nav, main, aside, section, and footer landmarks appropriately.
- Provide a skip link to the active track.
- A track is an ordered feed or list of entries with an accessible name.
- Each entry exposes its kind, position, timestamp, status, and summary.
- Heading levels describe document hierarchy and do not reset arbitrarily inside messages.
- Tabs use tablist, tab, and tabpanel semantics with correct selection state.
- Disclosure controls use buttons with aria-expanded and an owned region.
- Do not assign application role to the whole interface.
- Compact groups identify the number and kinds of full entries they represent and expose a direct full-view link.
- Exported static session/project pages retain the same landmarks, entry labels, heading hierarchy, and skip links without depending on the local API.

## Keyboard model

Initial proposed shortcuts:

| Shortcut | Action |
| --- | --- |
| Command/Ctrl + K | Open global command palette |
| / | Focus search in the current context |
| J / K | Select next/previous visible entry when focus is in the track |
| Enter | Expand or open selected entry |
| Escape | Close overlay, clear temporary mode, or return focus |
| F | Open event filters |
| I | Toggle inspector |
| C | Copy link to selected entry when not typing |
| Shift + C | Copy selected entry content when not typing |
| G then T | Jump to top of track |
| G then B | Jump to bottom/live tail |

Shortcuts must not fire inside editable controls or code-selection contexts. Single-character shortcuts are active only while focus is within the track-navigation region; any shortcut that is made global must also be disableable or remappable. Every shortcut is discoverable in the command palette and settings.

## Focus behavior

- Every interactive control has a visible focus indicator with sufficient contrast.
- Focus is not clipped by overflow containers.
- Opening an overlay places focus at its useful starting control.
- Closing returns focus to the trigger unless the trigger no longer exists.
- Filtering, virtualization, and live updates do not silently discard focus.
- When a selected entry unmounts due to filtering, focus moves predictably and the change is announced.
- Pointer selection must not remove keyboard focus styling globally.

## Screen readers and live updates

- Announce copy success, parse completion, and filter-result counts in polite live regions.
- Announce critical source-read or parse failures assertively only once.
- Do not stream assistant text word by word into a live region.
- A running entry announces start and final state, not every intermediate update.
- Tool arguments and raw payloads use structured lists/trees with clear expand controls.
- Provider logos have concise names; decorative event icons are hidden.

## Color and contrast

- Normal text meets at least 4.5:1 contrast.
- Large text meets at least 3:1.
- Focus indicators and meaningful non-text boundaries meet at least 3:1 against adjacent colors.
- Diff additions/deletions pair color with plus/minus markers, labels, or side bars.
- Running, partial, complete, and failed states have text/icon distinctions.
- Test dark and light themes in forced-colors mode and common color-vision simulations.

## Pointer and touch

- Important touch targets are at least 44×44px or have equivalent spacing.
- Desktop compact controls may appear smaller but should retain a generous invisible hit area where it does not create overlap.
- Hover-only actions also appear on focus and are available through entry menus.
- Drag is never the only way to complete an action.
- Tooltips do not obscure their trigger or trap pointer movement.

## Code, terminal, and diff accessibility

- Code remains selectable plain text beneath syntax styling.
- Language and filename labels are textual, not inferred solely from color.
- Horizontal scrolling has a keyboard-reachable container and visible focus.
- Line numbers are excluded from copied code unless explicitly requested.
- Terminal ANSI colors are remapped to accessible theme colors.
- Escape sequences are sanitized and never allowed to control the page.
- Diff rows expose old/new line numbers, change type, and content in a sensible reading order.
- Split diff mode has a unified alternative.
- Very large code/diff views explain that content is virtualized without making screen-reader access impossible.

## Pagination and virtualization accessibility

The semantic track is an ordered collection even when only a window is mounted. Windowed entries expose their stable position when the total is known and an appropriate “position unavailable” label for active/open-ended tracks. Loading an adjacent window must not reset the track's accessible name, selected entry, or reading context.

The initial implementation must prototype virtualization with VoiceOver before it becomes the only long-track path. If a virtualized feed cannot provide reliable browse-mode reading, focus restoration, and find-within-track behavior, Tracks provides a bounded accessible reading mode with explicit previous/next segments rather than claiming that visual virtualization is universally accessible.

Huge structured values and diffs use a summary plus explicit segmented/full-view navigation. Screen-reader users must be able to request additional content without mounting thousands of hidden rows or losing the control that initiated the request.

## Content safety and resilience

- Sanitize Markdown HTML, links, images, SVG, Math, and Mermaid-like embedded content.
- External links are visibly identified and require an explicit user action.
- Remote images are blocked by default to prevent data leakage and tracking.
- Malformed provider content degrades to safe text or structured raw data.
- Unsupported events remain inspectable.
- Redaction is announced and visually distinguishable from provider omission.
- Share previews announce excluded/redacted categories, and generated bundles do not rely on color or icons alone to communicate visibility or provenance.

## Responsive and zoom testing

Required manual checks:

- Browser zoom at 200% and 400%.
- OS text-size enlargement.
- 320px CSS viewport width.
- 390px touch viewport with on-screen keyboard.
- Landscape phone and small tablet.
- Long filenames, unbroken hashes, RTL text, Unicode, and emoji.
- Inspector and filters open at every breakpoint.

No essential content should require simultaneous two-dimensional scrolling, except code/diffs where horizontal scrolling preserves exact formatting and an alternative wrap mode exists.

## Performance budgets

Initial development budgets should be measured on a representative mid-range laptop:

| Interaction | Target |
| --- | --- |
| Shell visible from warm local start | Under 500ms |
| Library search response after keystroke | Under 100ms perceived latency |
| Open indexed session | Useful content under 500ms |
| Entry-to-entry keyboard navigation | Under one frame of avoidable work |
| Expand ordinary tool result | Under 100ms perceived latency |
| Scroll a 5,000-entry track | No persistent dropped-frame pattern |
| Filter current track | Under 100ms for common fixtures |

Large highlighting and diff computation should run incrementally or off the main thread. Budgets may be revised after real provider fixtures are collected, but regressions must remain visible.

## Required fixtures

Maintain synthetic, sanitized fixtures for:

1. Empty source and no sessions.
2. Ten-entry normal Claude Code session.
3. Streaming session with an active tool.
4. Five-thousand-entry long session.
5. One-thousand-line diff and a very large generated file.
6. Failed command with stdout and stderr.
7. Deep sub-agent nesting.
8. Malformed and partially written provider files.
9. Unsupported provider event.
10. Redacted secrets and sensitive absolute paths.
11. Unicode, RTL, emoji, and invalid encoding boundaries.
12. Provider-truncated tool result versus Tracks-collapsed result.
13. Minimum-shape session with unavailable reasoning, usage, diffs, and raw evidence.
14. Active/open-ended track whose final entry count is unknown.
15. Compact groups linked to full entries with several optional fields unavailable.
16. Offline single-session and multi-session project share bundles.

## Test layers

- Unit tests for canonical render decisions and accessible labels.
- Component tests for keyboard and state behavior.
- Automated accessibility checks for every component story.
- Browser tests for focus return, filtering, virtualization, and deep links.
- Visual regression at compact, medium, wide, and expansive widths.
- Performance tests using the large-session fixtures.
- Manual screen-reader runs on macOS VoiceOver and at least one additional platform before stable release.
- Reduced-motion, forced-colors, and high-contrast checks.
- Automated and manual accessibility tests against generated static bundles, not only the privileged localhost application.

## Release gate

A feature is not design-complete until:

- Its information and failure states are documented.
- Keyboard and pointer workflows both work.
- Focus behavior is deterministic.
- Narrow and worst-case content fixtures pass.
- Any motion has a stated purpose and reduced-motion behavior.
- No new unbounded rendering path is introduced.
- Visual-regression evidence is reviewed in both themes.
