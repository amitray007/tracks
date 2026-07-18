# Security policy

Tracks reads highly sensitive local developer data. Security and privacy reports are taken seriously.

## Supported versions

Tracks is pre-release software. Security fixes are made on the default branch; older commits and development branches are not supported releases.

## Reporting a vulnerability

Report vulnerabilities privately through [GitHub Security Advisories](https://github.com/amitray007/tracks/security/advisories/new). Do not include sensitive details in a public issue.

Please include:

- The affected component and commit.
- Reproduction steps using synthetic data.
- Expected and observed behavior.
- Potential impact.
- Any suggested mitigation.

Do not attach real agent sessions, credentials, private source code, or unredacted filesystem paths. If sensitive evidence is unavoidable, first describe what evidence exists and wait for a secure exchange method.

## Relevant security boundaries

High-priority reports include:

- Reading files outside an approved provider source.
- Exposing sessions without the intended owner or share-link authorization.
- Persisting session payloads on the hosted relay.
- Cross-origin access to the local viewer.
- Script execution or unsafe remote loading from rendered session content.
- Credentials appearing in logs, URLs, exports, or diagnostics.
- Share links granting access to a different session or device.

The broader threat model is documented in [docs/architecture/privacy-security.md](docs/architecture/privacy-security.md).
