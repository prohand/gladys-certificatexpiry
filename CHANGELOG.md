# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.1] - 2026-10-14

### Added

- Watch the TLS certificate of any host (name, IP address, `name:port`, IPv6,
  pasted URL): one Gladys device per host, with its days remaining, its expiry
  date and its issuer.
- Warning and critical thresholds, check interval, connection timeout, and an
  option to report untrusted certificates (self-signed, private authority,
  wrong host name).
- Connection badge per host: local when it answered, unreachable when it did
  not, degraded when its certificate is not trusted.
- Configuration screen buttons: "Check now" and "Inspect a host" (the whole
  certificate of any host, watched or not).
- Scene triggers "A certificate is expiring", "A certificate was renewed" and
  "A certificate check failed", fired once per change and remembered across
  restarts.
- Scene actions "Check a certificate" and "Check all certificates".
- Dashboard widget "Certificates": counters, the most urgent certificates
  first, and a "Check now" button.
- English, French, German and Spanish: configuration screen, messages, widget
  and documentation.
- CI (format, lint, tests on Node 22 and 24, store checks and Docker build on
  pull requests), UI-driven Release workflow, GitHub Releases, Dependabot.
- `SECURITY.md`, `CHANGELOG.md` and `CLAUDE.md`.

[Unreleased]: https://github.com/prohand/gladys-certificatexpiry/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/prohand/gladys-certificatexpiry/releases/tag/v1.0.1
