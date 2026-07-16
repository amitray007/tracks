# Design documentation

Tracks should feel like a native inspection tool for developers: calm, dense, fast, and trustworthy. It may learn from Traces' information hierarchy and polish, but it must develop its own identity rather than reproduce another product's brand or trade dress.

## Design principles

1. **Transcript first.** The session is the product. Chrome, controls, and metadata must support reading rather than compete with it.
2. **Structure before decoration.** Event type, nesting, chronology, and causality should remain understandable without relying on color.
3. **Dense, not cramped.** Prefer compact controls and short labels while preserving readable line lengths and predictable spacing.
4. **Progressive disclosure.** Show the human narrative by default; make raw tool payloads, metadata, and large results available on demand.
5. **Provider-neutral presentation.** Claude Code, Codex, and other sessions share the same visual grammar. Provider branding is context, not structure.
6. **Keyboard speed is sacred.** Frequent actions are immediate and do not wait for decorative animation.
7. **Motion explains.** Animation communicates origin, expansion, success, or continuity. It is never added merely to make the interface look active.
8. **Local trust.** The interface makes source location, redaction, parsing errors, and network behavior legible.
9. **Large sessions are normal.** Components must work with thousands of entries, huge diffs, long paths, and streaming updates.
10. **Good defaults over extensive theming.** One excellent dark theme and one accessible light theme matter more than an early theme marketplace.
11. **Compact is accountable.** A shorter view may group and collapse evidence, but every decision is deterministic and traceable to the full chronology.
12. **Sharing is a viewing surface.** Exported sessions and projects deserve the same hierarchy, accessibility, and performance quality as localhost—not a raw data dump.

## Reference status

Design documents use the following labels:

| Label | Meaning |
| --- | --- |
| Observed | Measured or identified in a public interface, DOM, stylesheet, or production bundle. |
| Inferred | Strongly suggested by evidence but not proven by a source manifest. |
| Proposed | A decision recommended for Tracks; it is not a claim about the reference product. |

## Documents

- [Traces reference audit](traces-reference-audit.md)
- [Foundations](foundations.md)
- [Components and interaction states](components.md)
- [Motion and interaction](motion.md)
- [Accessibility and quality](accessibility-quality.md)

## Required design evidence

Every major screen or component should eventually have:

- A purpose statement and primary user job.
- An anatomy diagram or named subparts.
- Default, hover, focus, active, disabled, loading, empty, error, and partial-data states where relevant.
- Narrow, medium, and wide layout behavior.
- Keyboard and screen-reader behavior.
- A motion decision, including “does not animate.”
- Fixtures for very short and very large content.
- A visual-regression story or screenshot.
- A performance expectation when it renders unbounded provider data.

## Design review rule

Review changes in this order:

1. Is the information correct?
2. Is the hierarchy obvious?
3. Can the task be completed with the keyboard?
4. Does it work with worst-case content?
5. Is the visual treatment coherent?
6. Does any animation make the task slower?

Polish cannot compensate for an ambiguous event model or a broken reading flow.
