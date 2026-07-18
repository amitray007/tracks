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

Add a fine-grained GitHub token as the Tracks Actions secret
`HOMEBREW_TAP_TOKEN`. Give it Contents read/write access only to
`amitray007/homebrew-tap`. Do not reuse a broad personal access token.

## Cut a release

1. Update the workspace package versions together and merge the change to
   `main` after `pnpm check` passes.
2. Create the tag from the merged commit and push it:

   ```sh
   git switch main
   git pull --ff-only
   git tag -a tracks-cli-vX.Y.Z -m "Tracks CLI vX.Y.Z"
   git push origin tracks-cli-vX.Y.Z
   ```

3. Watch the `Release CLI` workflow. It runs the complete workspace tests,
   builds the package, creates both releases, and updates the tap formula.
4. Verify a clean Homebrew install:

   ```sh
   brew update
   brew install amitray007/tap/tracks
   tracks --version
   tracks doctor
   tracks web start
   tracks web stop
   ```

The workflow is retry-safe: existing release assets are replaced and an
already-current formula produces no extra tap commit.

## Build the artifact locally

Use the same packaging entry point as CI:

```sh
pnpm install --frozen-lockfile
pnpm release:cli X.Y.Z
```

Artifacts are written to `release/`, which is ignored by Git. The packaging
step refuses a version that does not match `apps/cli/package.json`.
