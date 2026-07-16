# Privacy and security

## Security posture

Tracks reads some of a developer's most sensitive local data: source paths, prompts, code, command output, environment fragments, tool arguments, URLs, and potentially credentials. “Localhost” alone does not make this safe.

The default posture is:

- Read-only provider access.
- Explicit source boundaries.
- Loopback-only network binding.
- No telemetry or outbound session-content requests. The optional GitHub CLI identity treatment may resolve the signed-in user's public profile/avatar without sending session data.
- Untrusted rendering for every provider field.
- Least privilege for adapters and operating-system actions.
- Visible redaction and provenance.

## Threat model

Tracks must consider:

- Malicious or compromised repository content embedded in an agent session.
- Prompt/tool output containing HTML, scripts, tracking images, terminal escapes, or hostile URLs.
- Provider files that are malformed, enormous, deeply nested, or intentionally resource-exhausting.
- Symlinks and path traversal escaping an approved source.
- Another local web page attempting requests to the Tracks server.
- A local-network peer reaching an incorrectly bound server.
- Secrets appearing in logs, exports, screenshots, or crash reports.
- Third-party adapters reading unrelated files or making network requests.
- Browser extensions and other local software, which Tracks cannot fully control but should not unnecessarily assist.

Tracks does not claim protection from a fully compromised user account or operating system.

## Local server

- Bind to 127.0.0.1 and ::1 only by default.
- Use an unpredictable per-launch authentication token or equivalent same-user protection for API requests.
- Validate Origin/Host and reject cross-origin state-changing requests.
- Apply a restrictive Content Security Policy.
- Do not enable permissive CORS.
- Do not listen on 0.0.0.0 without an explicit, prominent user option and warning.
- Avoid exposing absolute source paths in shareable URLs.
- Set safe response headers and disable unnecessary caching for sensitive API responses.

If a desktop wrapper is introduced, retain the same explicit local-service trust boundary rather than assuming the webview is automatically safe.

During development, Portless provides the stable `.localhost` origin. Development scripts keep its app and proxy bindings on loopback, proxy API/live traffic through one origin, and never enable LAN, Tailscale, or Funnel exposure automatically. The shipped CLI implements its own loopback lifecycle and does not rely on Portless as a production security boundary.

## Filesystem policy

- Sources are added through trusted detection plus user approval or explicit selection.
- Canonicalize paths before policy checks.
- Resolve symlinks and verify the resolved target remains within an allowed boundary.
- Open files with read-only permissions.
- Re-check policy when resolving RawReference or ArtifactReference, not only during initial scan.
- Bound file size, record size, nesting depth, line length, and decompression.
- Treat provider-referenced attachments outside the configured source as unavailable until the user explicitly opens them.
- Do not follow repository links or session-provided paths automatically.

The source registry records why a path is allowed, which provider owns it, and when it was last accessed.

## Rendering untrusted content

### Markdown and HTML

- Parse through an allowlisted Markdown pipeline.
- Sanitize or reject raw HTML.
- Block scripts, event handlers, style injection, iframes, object/embed, and dangerous URL schemes.
- External links receive noopener/noreferrer behavior and a visible external indication.
- Remote images are blocked by default. Offer an explicit one-time load if later required.
- Inline SVG is sanitized or rendered as inert text/image data.
- Mermaid, Math, or rich embeds are separate opt-in renderers with their own sandboxing.

### Code and diffs

- Syntax highlighters receive plain strings and controlled language IDs.
- Generated HTML is produced by trusted local renderer code, not accepted from the provider.
- Diff parsing is size/time bounded and can be cancelled.
- Binary content is not coerced into text.

### Terminal output

- Parse only a safe ANSI subset for color/style.
- Strip cursor movement, title changes, hyperlinks unless sanitized, clipboard commands, device control, and other terminal behavior.
- Do not emulate an interactive terminal in a read-only result.
- Preserve a plain-text copy representation.

### Structured data

- Enforce maximum depth, keys, array length, and rendered bytes.
- Protect against prototype-pollution keys and cyclic structures.
- Render strings as text, never markup.

## Redaction

Redaction operates at display, index, export, and diagnostic boundaries.

Potential rules:

- Replace home-directory prefixes with a configurable token.
- Hide configured project roots.
- Detect common credential patterns and environment assignments.
- Mask query parameters or headers likely to contain secrets.
- Exclude selected reasoning or message content from search.
- Exclude raw payloads from export unless explicitly included.

Rules must minimize false confidence:

- Mark redacted regions visibly.
- Distinguish automatic, provider, and user redaction.
- Preview exports before writing.
- Warn that pattern-based secret detection is not exhaustive.
- Avoid indexing original sensitive values when policy says they are redacted.

## Logs and diagnostics

- Application logs contain IDs, counts, sizes, timings, and diagnostic codes by default—not full prompts, output, paths, or payloads.
- Debug logging that includes content is opt-in, visibly active, time bounded, and stored locally.
- Crash reports are written locally and previewed before any manual sharing.
- Adapter diagnostics reference raw evidence rather than embedding it.
- Errors displayed in the UI use redacted display paths.

## Index and cache

- Store the index in a user-specific directory with appropriate permissions.
- Document what is indexed and how to delete/rebuild it.
- Keep user annotations separate from rebuildable provider-derived data.
- Bound raw caches and provide retention controls.
- Do not duplicate entire provider sources merely for convenience.
- Database queries use parameters and size limits.
- Schema migration failure must not touch provider source data.

### Persistence policy

The first Claude Code implementation must document every persisted field before enabling it. The default distribution is:

| Data | Persist by default? | Reason and constraints |
| --- | --- | --- |
| Source approvals and provider assignment | Yes | User-owned configuration; store canonical policy data and a redacted display value separately |
| Track IDs, metadata, capabilities, counts, and diagnostics | Yes | Required for a fast library and health reporting; rebuildable from provider sources |
| Canonical entry envelopes and bounded summaries | Yes | Required for chronology, filters, anchors, and match navigation; rebuildable |
| Searchable message/tool/command/file text | Yes, subject to policy | Apply redaction/exclusion before FTS insertion; changing policy requires rebuild |
| Complete raw provider payloads | No | Read by revision-safe reference on demand; cache only under an explicit bounded policy |
| Large stdout, diffs, structured values, and attachments | No duplicate by default | Store a bounded preview/reference; resolve from the provider source when requested |
| Rendered Markdown/HTML or highlighted code | No | Recompute from untrusted text; never promote rendered output to trusted persisted content |
| Partial trailing records and UI expansion state | No | Ephemeral and likely to change |
| Aliases, tags, notes, preferences, and redaction rules | Yes | User-owned; keep separate from the rebuildable index |

SQLite journal/WAL files, temporary sort files, FTS shadow tables, worker caches, browser caches, and backups can contain the same sensitive material as the main database. They must use the same directory permissions, deletion workflow, retention policy, and content exclusions. Sensitive API responses use cache-control headers that prevent browser or intermediary persistence, and the application does not install an offline service-worker cache for session content by default.

Raw references include a source revision or verifiable content hash. When the source has changed, Tracks either verifies the referenced content, serves a deliberately retained bounded cache entry, or reports that the evidence is stale/unavailable. It never resolves a locator against new bytes and labels them as the original record.

### Current vertical-slice storage

The current Claude viewer does not create a Tracks database or copy session payloads. It scans Claude's authoritative JSONL files, normalizes the selected track in process/browser memory, and discards that derived data when the process or tab closes. The live SSE endpoint also keeps only response handles, sequence counters, and debounce state in memory.

When available, Tracks asks the already authenticated `gh` CLI for the current public profile and proxies the avatar through the loopback server so the browser does not contact GitHub directly. The identity/avatar is cached only in server memory for the process lifetime; failures fall back to a generic local avatar. No prompt, tool, path, or session data is sent with that lookup.

Users must be able to delete rebuildable index/cache data independently from user-owned metadata, and separately delete all Tracks-owned data. The UI explains that deleting the Tracks index does not delete the provider's authoritative session files.

## Adapter safety

Built-in adapters run with the main application's trust but still receive a restricted source-access API in design.

Future external adapters:

- Are installed only by explicit action.
- Declare publisher, adapter/API version, filesystem grants, and network needs.
- Run in a subprocess or sandbox with resource limits.
- Receive only assigned source handles.
- Communicate through a schema-validated, size-bounded protocol.
- Have no ability to inject UI code, CSS, HTML, or renderer plugins.
- Have outbound network disabled unless separately approved.
- Can be disabled and removed without damaging sources or user annotations.

Adapter output is validated exactly like untrusted external data.

## Operating-system actions

Actions such as reveal in Finder, open file, open URL, copy command, or continue in provider CLI require direct user activation.

- Display the target before opening an external URL.
- Validate file paths against current policy.
- Never execute a copied command automatically.
- A future continue-session action shows provider, project/cwd, and command before handoff.
- Destructive operations are outside the viewer's initial scope.

## Exports

- Export is explicit and never automatic.
- The user selects one exact session revision or reviews the exact project session revisions included.
- Default export omits raw provider payloads and applies configured redaction.
- The preview lists included sessions, artifacts, paths, remote links, and remaining warnings.
- Static HTML exports have a restrictive CSP and no remote dependencies by default.
- JSON exports include schema versions and redaction metadata.
- Exported content is treated as newly created user-owned data and is not silently uploaded.
- The preview renders the generated export files rather than a privileged localhost view.
- Generated bundles contain no local API credentials, writable endpoint, service worker, analytics, remote font, tracking image, or hidden absolute source reference.
- Project exports are immutable reviewed snapshots; newly discovered sessions are not added automatically.

Publishing is a separate boundary after export:

- The destination, account/credential, visibility, retention, update behavior, and deletion behavior are shown before upload.
- A publisher receives only the approved bundle and cannot read provider sources or query the unrestricted index.
- A returned URL is labeled local, public, direct-link, or authenticated/private according to the destination's actual enforcement.
- Local publisher receipts and share definitions are user-owned metadata. Remote revoke/delete is verified separately and never inferred from local deletion.
- Non-loopback preview/hosting requires explicit authentication and threat review; copying an ordinary local link does not enable network access.

## Security verification

Before stable release:

- Test cross-origin requests from an unrelated local origin.
- Test Host/Origin validation and loopback binding.
- Fuzz provider parsers with malformed, huge, deeply nested, and partial inputs.
- Test symlink/path traversal across every artifact/raw retrieval endpoint.
- Test Markdown XSS payload suites and dangerous URL schemes.
- Test ANSI control and OSC escape sequences.
- Verify remote images and fonts are not fetched.
- Open generated single-session and project bundles with the local service stopped and verify that no remote request occurs.
- Inspect generated files and search indexes for seeded secrets, local IDs, absolute paths, raw payloads, and API tokens.
- Test publisher isolation with a mock target that attempts to request files outside the approved bundle.
- Inspect logs and database for known seeded secrets.
- Validate adapter time, memory, and output limits.
- Review dependency and lockfile changes.
- Document deletion and incident-response steps.

## User-facing privacy statement

The application should state, in plain language:

- Which provider sources are configured.
- Which local paths Tracks can read.
- Where its index is stored.
- Whether live watching is active.
- Whether any network feature is enabled.
- How to delete the index and user metadata.
- What redaction can and cannot guarantee.

Trust is a visible product feature, not only an implementation detail.
