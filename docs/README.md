# Tracks documentation

Tracks is a local-first viewer for AI coding-agent sessions. It begins with Claude Code, while its core model and ingestion boundary are designed to support Codex, Grok CLI, and future command-line agents without rewriting the interface.

## Document map

### Product

- [Vision and principles](product/vision.md) — product promise, users, jobs, scope, and non-goals.
- [Requirements](product/requirements.md) — functional requirements, quality attributes, and acceptance criteria.

### Architecture

- [System overview](architecture/overview.md) — package boundaries, data flow, runtime shape, and extension strategy.
- [CLI and local runtime](architecture/cli-runtime.md) — CLI lifecycle, loopback service, live updates, packaging, and Portless development.
- [Provider adapter contract](architecture/provider-adapters.md) — how Claude Code, Codex, Grok CLI, and later integrations plug in.
- [Canonical session model](architecture/session-model.md) — the provider-neutral types consumed by the UI.
- [Privacy and security](architecture/privacy-security.md) — localhost defaults, untrusted content, redaction, and plugin safety.
- [Sharing and hosting](architecture/sharing-hosting.md) — session/project shares, static bundles, preview hosting, and publisher boundaries.

### Providers

- [Claude Code evidence](providers/claude-code.md) — current CLI capabilities, local JSONL shape observations, initial mapping, and fixture requirements.

### Design

- [Design documentation index](design/README.md)
- [Traces reference audit](design/traces-reference-audit.md) — observed design and technology details from the public Traces interface.
- [Foundations](design/foundations.md) — product personality, typography, color, spacing, layout, and responsive rules.
- [Components and interaction states](design/components.md) — component inventory, anatomy, variants, and state matrices.
- [Motion and interaction](design/motion.md) — animation decisions, timing, easing, and reduced-motion behavior.
- [Accessibility and quality](design/accessibility-quality.md) — keyboard, screen reader, visual, responsive, and performance QA.

### Delivery

- [Roadmap](roadmap.md) — staged implementation plan from Claude Code MVP to a provider ecosystem.

## Shared terminology

| Term | Meaning |
| --- | --- |
| Provider | A supported coding agent or CLI, such as Claude Code or Codex. |
| Source | A provider-owned directory, database, or file collection that contains sessions. |
| Session | One conversation/run as represented by its provider. |
| Track | Tracks' normalized, read-only representation of a provider session. |
| Entry | One chronological unit in a track: message, reasoning block, tool call, result, file change, status, or error. |
| Artifact | A file, diff, image, command output, plan, or other inspectable object referenced by an entry. |
| Adapter | Code that detects, reads, normalizes, and optionally watches one provider's session format. |
| Capability | An adapter-wide declaration and session-observed state for data or behavior such as reasoning, usage, diffs, raw evidence, or live updates. |
| Availability | Whether particular data is available, partial, unavailable, redacted, stale, or unknown. |
| Provider evidence | Original provider identity, terminology, source location, and revision-safe raw reference retained alongside canonical facts. |
| Derived index | Rebuildable Tracks-owned metadata, canonical projections, and policy-approved searchable text; not the provider source of truth. |
| Compact view | A deterministic, reversible narrative projection that groups/collapses low-signal mechanics while retaining links to full evidence. |
| Full view | The complete normalized chronology with filters, inspection, raw evidence state, and every supported/unsupported entry. |
| Share bundle | A sanitized immutable static session/project snapshot that can be previewed locally and hosted independently. |

The word “trace” is used only when discussing the Traces reference product or generic tracing concepts. Tracks' own user-facing nouns should be “session,” “track,” and “entry.”

## Documentation conventions

- Product decisions use **MUST**, **SHOULD**, and **MAY** with their RFC-style meanings.
- Provider-specific behavior belongs in provider documentation, not the canonical model.
- Design references distinguish **Observed**, **Inferred**, and **Proposed** facts.
- Examples must not contain real credentials, private prompts, or absolute paths copied from personal sessions.
- When implementation and documentation disagree, treat the discrepancy as a change that needs an explicit decision rather than silently editing one side.
