# Certificate Expiry — Gladys Assistant integration

External integration for [Gladys Assistant](https://gladysassistant.com) that
watches the **TLS certificates** of your websites and devices, and warns you
before they expire.

- One Gladys device per host: **days remaining** (with history), **expiry
  date**, **issuer**.
- Works for public websites and for local devices (NAS, router, reverse proxy,
  mail server…): one direct TLS handshake from the Gladys machine, no account,
  no cloud service (`transports: ["local"]`).
- **Scene triggers**: a certificate is expiring (warning / critical / expired),
  a certificate was renewed, a check failed (unreachable / untrusted). Fired
  once per change, remembered across restarts.
- **Scene actions**: check one certificate, check them all, with outputs for
  the next actions.
- **Dashboard widget** "Certificates": counters, the most urgent first, a
  "Check now" button.
- **Configuration screen buttons**: "Check now" and "Inspect a host".
- English, French, German and Spanish.

User documentation: [English](docs/en.md) · [Français](docs/fr.md) ·
[Deutsch](docs/de.md) · [Español](docs/es.md).

Requires **Gladys 5.1.0** or later.

## Project structure

```
.
├─ index.js                          # SDK bootstrap
├─ src/
│  ├─ app.js                         # wiring: handlers, timer, lifecycle
│  ├─ config.js                      # defaults + normalization
│  ├─ i18n.js / texts.js             # the four languages, shared words
│  ├─ certificates/                  # endpoints, TLS checker, levels, store, monitor
│  ├─ devices/certificate.js         # the device and its states
│  └─ capabilities/                  # actions, scene actions, widget
├─ docs/{en,fr,de,es}.md             # user documentation (re-hosted by Gladys)
├─ test/                             # node --test, no network
├─ gladys-assistant-integration.json # manifest
├─ Dockerfile                        # Node 24 Alpine, read-only rootfs ready
├─ CHANGELOG.md · SECURITY.md · CLAUDE.md
└─ .github/                          # CI, Release, build, GitHub releases, Dependabot
```

## Development

```bash
npm install
npm run format:check
npm run lint
npm test
```

Run it against a Gladys instance:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="certificate-expiry" \
DATA_DIR=./data \
LOG_LEVEL=debug \
npm start
```

`DATA_DIR` (default `/data`) is where the last known state of each certificate
is kept.

Check the store rules locally before a release:

```bash
npx github:GladysAssistant/integration-store .
```

## Release

1. Describe the changes under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md).
2. **Actions → Release → Run workflow**, pick `patch`, `minor` or `major`.

The workflow bumps `package.json`, the manifest `version` and `docker_image`,
rolls the changelog, tags `vX.Y.Z`, builds the `linux/amd64` + `linux/arm64`
image to `ghcr.io/prohand/gladys-certificatexpiry` and publishes the GitHub
Release.

To be listed in the store, the repository must be public and carry the GitHub
topic `gladys-assistant-integration`. Turn on **Private vulnerability
reporting** in the repository security settings: [`SECURITY.md`](SECURITY.md)
sends reporters there.

## License

Apache-2.0
