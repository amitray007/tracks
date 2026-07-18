# Releasing the Tracks CLI

Tracks ships the CLI and compiled local viewer as one Homebrew artifact. The
private source repository keeps a copy for provenance, while the public
`amitray007/homebrew-tap` release hosts the identical tarball so Homebrew can
download it without GitHub authentication.

## Release layout

For version `X.Y.Z`, the release workflow creates:

- tag `tracks-cli-vX.Y.Z` in `amitray007/tracks`;
- `tracks-cli-X.Y.Z.tgz` and its SHA-256 checksum on the Tracks release;
- the same two files on the public Homebrew tap release;
- `Formula/tracks.rb` in the tap, pinned to the public artifact and checksum.

The tarball contains compiled CLI code, production Node dependencies, the
compiled web viewer, package metadata, and the MIT license. Homebrew supplies
Node and installs a small `tracks` launcher.

## One-time repository setup

Allow GitHub Actions to create pull requests in the Tracks repository Actions
settings. Release Please uses the workflow's built-in `GITHUB_TOKEN`; no
personal release token is needed. After creating or updating a release pull
request, the workflow explicitly dispatches CI and secret scanning against its
branch so the normal branch checks still apply.

Add a fine-grained GitHub token as the Tracks Actions secret
`HOMEBREW_TAP_TOKEN`. Give it Contents read/write access only to
`amitray007/homebrew-tap`. Do not reuse a broad personal access token.

## Version selection

Release Please derives the next version from Conventional Commits merged since
the last release that also touch `apps/cli/`:

| Change | Commit example | Version before 1.0 |
| --- | --- | --- |
| Bug fix or compatible correction | `fix: reconnect shared sessions` | Patch |
| Genuine new user-facing capability | `feat: add session export` | Minor |
| Breaking public contract | `feat!: replace share-link format` plus a `BREAKING CHANGE:` footer | Minor |
| Documentation, tests, chores, CI, or refactors | `docs: explain local sharing` | No release by itself |

Breaking changes become major releases after Tracks deliberately reaches 1.0.
Commit types describe the change; do not use `feat:` merely to force a minor
release. For an intentional product-driven version, use a `Release-As: X.Y.Z`
footer in a Conventional Commit rather than misclassifying the work.

`apps/cli` is the only releasable component. A commit confined to `apps/web`,
`apps/cloud`, `apps/server`, `packages`, documentation, CI, or another path is
not included in CLI version calculation and does not create a release. Do not
touch a CLI file artificially to opt an unrelated change into a release.

## Cut a release

1. Merge ordinary Conventional Commit changes to `main`. The `Release Please`
   workflow creates or updates one release pull request only when eligible
   commits touch `apps/cli/`. The pull request contains the computed CLI
   version and CLI changelog.
2. Review and merge that release pull request when the accumulated changes are
   ready to ship. The normal branch rules, approval, CI, and secret scan still
   apply.
3. The merge causes Release Please to create the `tracks-cli-vX.Y.Z` tag and
   Tracks GitHub release. In the same workflow, `Release CLI` runs the complete
   workspace tests, attaches the CLI artifact, mirrors it to the public tap,
   and updates the formula.
4. Verify a clean Homebrew install:

   ```sh
   brew update
   brew install amitray007/tap/tracks
   tracks --version
   tracks doctor
   tracks web start
   tracks web stop
   ```

The publishing workflow is retry-safe: existing release assets are replaced
and an already-current formula produces no extra tap commit. To retry a failed
publish for an existing release tag without creating a new version, run:

```sh
gh workflow run release-cli.yml -f tag=tracks-cli-vX.Y.Z
```

Release Please updates `apps/cli/package.json`; other private workspace package
versions are independent and do not determine the Homebrew release version.

## Build the artifact locally

Use the same packaging entry point as CI:

```sh
pnpm install --frozen-lockfile
pnpm release:cli X.Y.Z
```

Artifacts are written to `release/`, which is ignored by Git. The packaging
step refuses a version that does not match `apps/cli/package.json`.
