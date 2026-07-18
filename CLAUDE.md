# Claude Code instructions

Follow the repository guidance in `AGENTS.md`.

## Commit and release semantics

Do not default to `feat:`. Conventional Commit types must reflect the actual
change, not the version number an agent wants the release process to generate.

- `fix:`: bug fixes, regressions, compatibility corrections, and refinements
  to existing behavior or UI.
- `feat:`: only a genuine new user-facing capability or newly supported
  behavior.
- `docs:`, `test:`, `chore:`, `build:`, `ci:`, `refactor:`, and `perf:`: use
  when they describe the work more precisely.
- Breaking public API, CLI, protocol, configuration, or persisted-data changes:
  add `!` and a `BREAKING CHANGE:` footer.

Tracks is pre-1.0. Patch fixes and minor features follow their normal levels;
breaking changes are released as minor versions until Tracks deliberately
declares 1.0. Never label work as a feature solely to force a minor release.

## CLI release scope

Release Please treats only `apps/cli/` as the releasable Homebrew CLI
component. A commit that changes only the web, cloud/server, shared packages,
documentation, CI, or another non-CLI path must not create a CLI release.
Never touch `apps/cli/` artificially to force release automation to run.
