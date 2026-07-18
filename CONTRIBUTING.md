# Contributing to Tracks

Thanks for helping improve Tracks. The project is pre-release, so small, focused changes with clear evidence are easier to review and maintain.

## Development setup

Requirements:

- Node.js 24 or newer.
- pnpm 10.33.2 through Corepack.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm check
```

Use `pnpm dev` for the Portless development environment or `pnpm dev:plain` for the loopback HTTP fallback.

## Privacy rules

Agent sessions may contain source code, prompts, credentials, absolute paths, repository names, URLs, and personal conversations. Contributions must not include data copied from a real private session.

- Build the smallest synthetic fixture that demonstrates the record shape.
- Use neutral usernames, repositories, paths, hostnames, and session IDs.
- Never commit `.env` files, Tracks runtime state, exported sessions, access tokens, or screenshots containing private content.
- Remove unrelated fields from bug reproductions.
- Describe a provider shape without publishing the underlying private payload.
- Treat copied terminal output and browser screenshots as sensitive until reviewed.

If a realistic fixture is necessary, obtain explicit permission from every affected data owner and document the sanitization. Prefer a synthetic fixture whenever possible.

## Pull requests

1. Create a focused branch.
2. Add or update tests for behavior changes.
3. Update architecture or provider documentation when the canonical model changes.
4. Run `pnpm check`.
5. Run a redacted secret scan when Gitleaks is available: `gitleaks git . --redact`.
6. Complete the privacy checklist in the pull-request template.

Avoid committing generated `dist`, coverage, local runtime state, or session export directories.

## Reporting security issues

Do not open a public issue for a vulnerability or accidental data exposure. Follow [SECURITY.md](SECURITY.md) instead.
