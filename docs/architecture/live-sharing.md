# Live sharing and hosted server

## Decision

Tracks has three web surfaces that reuse the same normalized track renderers but have different authority:

| Surface | Runs where | Can enumerate | Session content source |
| --- | --- | --- | --- |
| Local web | On the user's device | That device's approved local library | Local loopback service |
| Server web | On a self-hosted Tracks Server | Authenticated devices currently connected to that server | Requested from an online device |
| Live share | On Tracks Server at one unguessable share URL | Only the explicitly shared session or project selection | Requested from the sharing device while it is online |

The hosted server is a rendezvous and relay, not a session database. It MUST NOT persist provider files, normalized transcripts, search text, artifacts, or session lists. The first server scaffold persists nothing at all: device presence lives in process memory and disappears on restart.

Static sanitized bundles remain a separate sharing mode. They are durable snapshots that continue to work while the source device is offline; live shares deliberately do not.

## Runtime topology

~~~mermaid
flowchart LR
    FS["Claude Code files"] --> LA["Local Tracks agent"]
    LA --> LW["Local web view"]
    LA -- "outbound WSS" --> CS["Tracks Server relay"]
    CS --> OW["Authenticated server web"]
    CS --> PV["Scoped live-share viewer"]
    OW -. "bounded request" .-> CS
    PV -. "share-scoped request" .-> CS
    CS -. "request/response stream" .-> LA

    CS --- EP["Ephemeral presence and request routing"]
    CS -.- NS["No transcript or artifact persistence"]
~~~

The local agent initiates the only device connection. Users do not open inbound ports, expose the loopback API, or give the hosted server filesystem access. The server forwards typed, bounded requests to a connected device and applies authorization before routing any response to an owner dashboard or live viewer.

## Control plane and data plane

The protocol separates small control messages from potentially large session data.

### Control plane

- Protocol negotiation and device identity.
- Device presence and last-seen heartbeats.
- Capability advertisement.
- Library/track invalidation notices containing opaque IDs and revisions, not content.
- Share creation, revocation, audience, expiry, and online/offline state.
- Request IDs, cancellation, timeouts, and backpressure signals.

### Data plane

- Cursor-bounded library pages.
- Anchor- or cursor-bounded track entry pages.
- Explicit artifact byte ranges.
- Search results computed on the device when a server view searches a device library.

The data plane is request-driven. A device MUST NOT upload its complete library or continually mirror active transcripts merely because it connected. Responses have strict byte/entry limits and expire after delivery. A future multi-process deployment may use an ephemeral broker for request routing, but a queue or cache must not silently become transcript storage.

## Current foundation

`packages/live-protocol` contains protocol v1 schemas for agent hello, heartbeat, server welcome/error, device capabilities, and the connected-device projection. `apps/cloud` implements:

- An authenticated WebSocket agent endpoint at `/api/agent`.
- In-memory device presence with replacement and heartbeat handling.
- An authenticated bounded device API at `/api/devices`.
- An authenticated SSE presence stream at `/api/events`.
- A minimal server dashboard and an unauthenticated health endpoint.
- A 64 KiB ceiling for the current control socket.

This slice intentionally stops before session relay, account login, share creation, or durable control-plane metadata. `TRACKS_CLOUD_TOKEN` is a deployment bootstrap mechanism for self-hosted development, not the final user authentication design.

## Identity and links

Device IDs are random UUIDs generated once per local installation and stored as user-owned configuration. They are not derived from a hostname, filesystem path, account email, or provider session ID.

Live share URLs should use a stable random share ID plus a separate high-entropy bearer secret, for example:

    https://tracks.example/s/<share-id>#<viewer-secret>

The fragment keeps the viewer secret out of ordinary HTTP access logs. The server stores only the minimum durable control record needed to route and revoke a share: account/device ownership, opaque local resource handle, policy, expiry, and a hash of the viewer secret. It does not store the session title or transcript. If the product chooses a strictly zero-durable-state server, the same record can instead be signed into an expiring capability token, at the cost of weaker immediate revocation. That choice requires an ADR before public sharing ships.

Opening a live link while its source device is disconnected returns a deliberate empty state: the session remains on its device, the link is valid, and the viewer may retry or wait for reconnection. It never falls back to an old server-side copy. A user who needs offline availability creates a reviewed static share instead.

## File watching and live propagation

One local watcher feeds both local and remote views:

1. The local runtime watches approved provider roots and debounces related filesystem events.
2. The adapter rescans only the affected session and computes a verified revision/delta where possible.
3. Local web clients receive the existing same-origin SSE invalidation immediately.
4. If connected, the agent sends the server an opaque track/revision invalidation.
5. Active server/live viewers request the next bounded page from the device; idle viewers receive no session bytes.

This avoids duplicate watchers and avoids pushing an entire growing JSONL file on every append. Rewrite, compaction, or uncertain boundaries cause a safe bounded re-fetch. Backpressure coalesces invalidations by track, and the newest known revision supersedes older queued invalidations.

## Authentication and authorization target

The production flow should use browser login plus an OAuth-style device authorization grant:

1. `tracks login` opens or prints a short device verification flow.
2. The CLI receives a revocable, device-scoped refresh credential from the server.
3. `tracks connect` exchanges it for a short-lived connection token and opens outbound WSS.
4. The server dashboard authenticates the account and lists only that account's connected devices.
5. Every routed request is authorized against device ownership and, for a live share, the exact share scope.

Credentials are user-owned local data stored through the OS credential store where available. They never enter provider sources, the derived session index, URLs, or diagnostic output. Local web remains accountless and fully useful when logged out.

## CLI and daemon shape

`tracks web` and `tracks connect` should be two responsibilities inside one lightweight background agent, not two competing daemons:

- The local web module owns loopback HTTP, indexing, watching, and browser launch.
- The connection module owns authentication refresh, reconnect with jitter, and the server WebSocket.
- Either module may be enabled independently.
- A single lock/state file prevents duplicate index writers and duplicate device connections.
- `tracks status` reports local web and remote connection state separately.

Auto-start is a configuration choice, initially off. Enabling it installs a user-level service through an explicit web workflow or CLI confirmation. A connection failure never stops local watching or local viewing.

## Deployment

The repository root `compose.yaml` builds `apps/cloud` as a non-root, read-only container, publishes it on loopback by default, and mounts no data volume. It is an intentionally single-process bootstrap deployment.

For internet exposure, operators must put it behind HTTPS/WSS, configure origin and proxy limits, replace the bootstrap token with production authentication, and decide how the minimal account/share control plane is stored. Adding a database is not permission to store session content.

## Delivery sequence

1. Presence foundation: versioned protocol, in-memory server, dashboard, health, container deployment.
2. Local agent lifecycle: `web`, `status`, `config`, one watcher, background process state.
3. Authentication and connection: `login`, device grant, `connect`, reconnect, owner device dashboard.
4. Read-only relay: bounded library and track pages, request cancellation, revision invalidation, server-side device view.
5. Scoped live shares: per-session/project capability, offline state, revoke/expiry, viewer isolation.
6. Hardening: TLS deployment guide, rate limits, audit metadata without content, multi-instance ephemeral routing, load and abuse tests.
7. Offline sharing: polished reviewed static bundles remain available alongside live sharing.

At every phase, a network capture and server filesystem inspection should be able to demonstrate that no unrequested session content was mirrored or retained.
