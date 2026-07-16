# ADR 0002: Server-sent events for local source updates

- **Status:** Accepted for the Claude Code vertical slice
- **Date:** 2026-07-16
- **Scope:** Local session library and open-track freshness

## Context

Tracks needs to reflect Claude session-file changes in the sidebar and the open trace. The direction is server-to-browser only: the browser does not send commands over the live channel. Claude JSONL sources can be appended, rewritten, or replaced, so a filesystem notification alone is not a safe entry delta.

## Decision

- Recursively watch the configured Claude source with Node's filesystem watcher.
- Debounce bursts before refreshing the provider catalog.
- Publish named events at the same-origin `/api/events` endpoint using `text/event-stream`.
- Send `connected`, `catalog.updated`, and `catalog.error` events plus periodic comment heartbeats.
- Let the browser's native `EventSource` handle reconnection, with a 1.5-second retry hint.
- Treat events as invalidations. On update, refetch the cached library and reparse the complete selected track rather than assuming an append-only source.
- Do not send absolute source paths or transcript content in live events.
- Close watchers, heartbeat timers, and connected responses when the foreground server stops.

## Consequences

SSE fits the one-way flow and works through the existing HTTP/Portless proxy path without a second protocol or WebSocket state machine. The UI can show a truthful connected/reconnecting state and updates both navigation and content without polling.

The current complete-track reparse favors correctness over optimal work. Very large or frequently rewritten sessions may use more CPU and transfer than necessary. The indexer phase should introduce revision-aware incremental parsing, bounded invalidations, scroll anchoring, and backpressure without changing the endpoint's one-way semantics unless a future bidirectional feature provides a concrete reason.

## Validation evidence

- Server tests open the event stream, append a sanitized Claude fixture record, and observe `catalog.updated` with only the changed basename.
- Browser verification confirms `EventSource` connects on the loopback production path and the UI reports live status.
- The local server continues to reject non-local origins and binds only to loopback.
