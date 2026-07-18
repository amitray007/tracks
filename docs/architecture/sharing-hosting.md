# Sharing and hosting

## Product promise

Tracks is local-first and share-capable. A user should be able to inspect everything privately, then deliberately turn one session or a project-scoped set of sessions into a polished, portable viewing experience within a few actions.

Sharing must not require the core viewer to become cloud-dependent. The first share artifact is a sanitized static site/package that can be previewed locally and hosted on ordinary static infrastructure. After that contract is proven, Tracks should add one easy explicit publisher that returns a hosted URL; the local viewer and static export continue to work without it.

## Share units

### Session share

An immutable snapshot of one track at a specific source revision. It contains compact and full views, stable entry anchors, included artifacts, provenance, and redaction metadata.

### Project share

An immutable snapshot containing a selected set of tracks associated with one project identity. It includes a project landing page, session library, filters/search suitable for the exported corpus, and per-track compact/full views.

Project share never means “silently publish every current and future local session.” The user sees and confirms the exact included session revisions. Updating a share is a separate explicit action.

## Share modes

| Mode | Audience | Network behavior | Initial status |
| --- | --- | --- | --- |
| Local link | Same machine/user | Existing loopback viewer only | P0 |
| Local bundle preview | Same machine/user | Temporary loopback static server | P0 |
| Portable static bundle | Anyone who receives/hosts the files | No runtime API or remote dependency required | P0 |
| Explicit LAN/tailnet host | Approved network peers | Non-loopback bind plus authentication | P1 after threat review |
| Preferred managed publish target | Public/direct/private hosted URL | Explicit upload of approved bundle | P1/MVP follow-up |
| Device-backed live share | Public/direct/private scoped URL | Routes bounded data from a connected source device; no server transcript storage | P1 after authentication and relay hardening |
| Additional publisher integrations | Destination-specific | Same restricted publisher contract | Later |

The UI labels local links as local-only so they are not mistaken for shareable public URLs.

Live sharing and static publishing solve different jobs. A live share can follow an active session without uploading a durable copy, but it shows an offline state when the source device disconnects. A static bundle is an explicitly reviewed immutable copy that remains available without the source device. Tracks presents this tradeoff before link creation rather than silently switching modes. See [Live sharing and hosted server](live-sharing.md).

## UI-first sharing workflow

1. Choose **Share** from a track or project.
2. Select session or project scope.
3. Review the exact included tracks, revisions, entries, and artifacts.
4. Choose compact/full defaults without removing the alternate view unless explicitly requested.
5. Apply redaction and inclusion rules.
6. Preview remaining paths, URLs, commands, prompts, reasoning, attachments, and secret warnings.
7. Generate a deterministic static bundle.
8. Preview locally.
9. Download the bundle or choose an explicitly configured hosting target.
10. Copy the resulting local or hosted link with its scope and visibility clearly shown.

The fast path remembers safe preferences, but it never bypasses the preview for a new destination or newly detected sensitive content.

## Static share package

The portable output is dependency-free at runtime and works from a static host. It contains:

- A small application shell and bundled fonts/icons/styles/scripts.
- A project or session manifest.
- Versioned normalized track projections.
- A bounded search index for project shares.
- Included artifact files and previews.
- Redaction/inclusion metadata and warnings.
- Compact and full view routing with stable anchors.
- A restrictive Content Security Policy and no remote fetches by default.

The manifest records at least:

~~~ts
export interface ShareManifest {
  shareSchemaVersion: number;
  tracksSchemaVersion: number;
  scope: "session" | "project";
  createdAt: string;
  generatorVersion: string;
  tracks: Array<{
    trackId: string;
    sourceRevision: string;
    exportedRevision: string;
  }>;
  defaultView: "compact" | "full";
  redactionProfile: string;
  rawPayloadsIncluded: boolean;
  remoteDependencies: [];
}
~~~

The export uses generated share-local IDs where exposing stable local IDs would leak information or create unwanted correlation. Absolute source paths, configured-source details, local API tokens, logs, index internals, and raw provider payloads are excluded by default.

## Hosting boundary

Tracks separates export generation from publishing:

- **Exporter:** creates and validates a deterministic local bundle.
- **Preview host:** serves that bundle on loopback for final review.
- **Publisher:** uploads an already-approved bundle to one explicit destination and returns a URL/visibility result.

The publisher contract accepts files plus declared visibility; it does not receive unrestricted source or index access. Each hosting integration declares authentication, size limits, retention, visibility semantics, update/delete behavior, and whether access control is real or merely link obscurity.

The first viewer release can be useful without a managed backend: a user can generate a static directory/ZIP and deploy it to a preferred static host. The sharing vision is complete only after one preferred publisher provides a short, explicit path to public/direct/private URLs. No upload occurs by default, and local viewing never requires publisher authentication.

Tracks Server is a fourth, distinct boundary: a rendezvous and request relay for online devices. Its owner dashboard may enumerate connected devices after authentication, but the server does not ingest or persist their libraries. A live viewer receives only the exact share-scoped projections requested from the currently connected device. It is not a publisher and never receives unrestricted source/index access.

## Updating and revoking shares

- Static bundles are immutable snapshots. Regeneration produces a new revision.
- A managed target may update a stable share URL only after showing which local track revisions changed.
- Project updates do not automatically add newly discovered sessions unless the share definition explicitly includes a reviewed rule and the user confirms the update.
- Tracks records publisher receipts/URLs as user-owned metadata, not provider-derived data.
- Deleting local publisher metadata does not imply remote deletion; the UI reports remote revoke/delete status explicitly.

## Security requirements

- Sharing is an explicit outbound boundary and always names the destination.
- Raw payloads, reasoning, attachments, environment fragments, absolute paths, and external links are separately reviewable categories.
- Redaction is applied before export files and search indexes are written.
- The preview uses the generated files, not a privileged view into the local index.
- Static output contains no API token, writable endpoint, service worker, analytics, remote font, tracking image, or hidden source reference.
- LAN/tailnet/public serving never reuses the ordinary unauthenticated loopback assumption.
- “Anyone with the link” is described accurately and never presented as authenticated private access.

## Acceptance scenarios

### Share one session

From an open track, the user chooses Share, reviews a redacted compact/full preview, generates a bundle, opens it locally, and obtains a file or hosted link without exposing unselected raw payloads or source paths.

### Share a project

From a project library, the user selects an exact set of session revisions, previews a project landing page and searchable session list, generates one static bundle, and can open every exported track without the Tracks local service.

### Update a live session share

When the local source has advanced, Tracks shows the old and new source revisions and affected counts. The user explicitly regenerates or republishes; the existing share is never changed silently.
