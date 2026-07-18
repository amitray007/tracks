# ADR 0001: TypeScript workspace and loopback runtime

- **Status:** Accepted for the Claude Code vertical slice
- **Date:** 2026-07-16
- **Scope:** Phase 0 and Phase 1 implementation

## Context

Tracks needs to validate Claude Code discovery, parsing, canonical schemas, the local API, and the web viewer without prematurely committing to a harder-to-package systems runtime. The implementation also needs shared boundary types, fast fixture iteration, a production-like same-origin path, and stable development URLs.

The installed product must not depend on a development proxy. It binds to loopback, serves its own static web assets, and keeps provider source access out of the browser.

## Decision

- Use a pnpm workspace with `apps/web`, `apps/server`, `apps/cli`, and independent core/provider packages.
- Use TypeScript for the initial canonical model, adapter boundary, Claude adapter, server, CLI, and React UI.
- Support Node.js 22.12 or newer for the workspace and CLI runtime. Use Node.js
  24 or newer for the optional Portless development command because Portless
  requires it; keep the fixed-loopback development path available on Node.js 22.
- Use runtime schemas at API and canonical boundaries rather than trusting TypeScript types on the wire.
- Bind the shipped/production-like server only to `127.0.0.1`, `::1`, or `localhost`; reject non-local Host and Origin values.
- Serve the built web application and API from one loopback origin in the CLI path.
- Pin Portless `0.15.3` as a development dependency. In development it names the web app `tracks.localhost` and the API `api.tracks.localhost`; Vite proxies browser API requests through the same web origin.
- Keep `pnpm dev:plain` as a no-certificate, fixed-loopback fallback.
- Keep Portless outside the installed CLI runtime dependency chain.

## Consequences

Shared TypeScript types speed up the first evidence-driven adapter and UI work. Package dependencies enforce that provider code cannot import the UI, while the browser receives only canonical view data.

The current CLI runs in the foreground and does not yet implement a user runtime directory, lock/state file, background reuse, status, or stop. The API currently relies on loopback binding plus Host/Origin checks; the per-launch same-user authorization mechanism remains required before claiming the lifecycle design complete.

Node packaging size, startup behavior, file watching, SQLite integration, and cross-platform distribution must be measured before this decision is extended beyond the Claude vertical slice. A later runtime change must preserve the provider contract and canonical wire model.

## Validation evidence

- Sanitized adapter fixtures cover known blocks, unknown records, malformed JSONL, nested-file exclusion, and bounded slices.
- The initial metadata-only scan discovers hundreds of local top-level sessions in under one second without reading complete transcript files.
- Server tests cover health, library, track retrieval, and rejection of non-local origins.
- The production web build is served by the foreground loopback CLI and tested against the local Claude corpus.
