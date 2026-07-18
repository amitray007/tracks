# Agent instructions

## Commit and release semantics

Use Conventional Commit types to describe the actual impact of a change. Do not
use `feat:` as a default or as a way to force a minor release.

- Use `fix:` for bug fixes, regressions, compatibility corrections, and
  refinements to existing behavior or UI.
- Use `feat:` only when the change introduces a genuine new user-facing
  capability or newly supported behavior.
- Use `docs:`, `test:`, `chore:`, `build:`, `ci:`, `refactor:`, or `perf:` when
  one of those more accurately describes the change.
- Mark an incompatible public API, CLI, protocol, configuration, or persisted
  data change with `!` and explain it in a `BREAKING CHANGE:` footer.

Commit types are evidence for release automation, not release controls. Choose
the type from the change itself; never inflate a commit to `feat:` merely to
obtain a minor version bump. If a release needs a specific version for product
reasons, handle that explicitly in the release process.

Tracks is pre-1.0: fixes and compatible refinements normally produce a patch,
new capabilities produce a minor, and breaking changes remain minor until the
project deliberately declares a stable 1.0 contract. After 1.0, breaking
changes produce a major release.
