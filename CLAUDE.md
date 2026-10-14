# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step, one
runtime dependency: `@gladysassistant/integration-sdk`) that watches the expiry
date of **TLS certificates**. Each host of the configuration (websites, NAS,
router, reverse proxy, mail server…) becomes a Gladys device with its days
remaining, its expiry date and its issuer. Gladys 5.1+ adds scene triggers
(expiring, renewed, check failed), scene actions (check one, check all) and a
"Certificates" dashboard widget. It started from the official JavaScript
template (`GladysAssistant/integration-template-js`); the CI and release
workflows are the ones of `prohand/gladys-devmel`.

## Commands

```bash
npm install
npm test                                     # node --test (built-in runner)
node --test test/monitor.test.js             # one file
node --test --test-name-pattern "renewal"    # tests whose name matches
npm run lint                                 # eslint .
npm run format:check                         # prettier --check . (CI gate)
npm run format                               # prettier --write .
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on
Node 22 and 24; pull requests also run the store checks and build the Docker
image. Run the three commands before pushing.

## Architecture

```
index.js                          SDK bootstrap only (new GladysIntegration, connect, shutdown)
src/app.js                        all the wiring: handlers, timer, lifecycle (tested with the fake Gladys)
src/config.js                     DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
src/i18n.js                       LANGUAGES = en, fr, de, es; localize / pick
src/texts.js                      the shared words (levels, days, summaries, inspection)
src/certificates/endpoints.js     the Hosts field -> endpoints { id, host, port, label }
src/certificates/checker.js       one TLS handshake -> certificate result (never rejects)
src/certificates/levels.js        expiry level (ok/warning/critical/expired) and problem (unreachable/untrusted)
src/certificates/store.js         last known record per endpoint, persisted in /data/certificates.json
src/certificates/monitor.js       check rounds: states, transport badges, scene triggers on transitions
src/devices/certificate.js        the device payload (days_remaining, expires_at, issuer) and its states
src/capabilities/actions.js       Configuration screen buttons (check_now, inspect_host)
src/capabilities/scenes.js        scene actions (check_certificate, check_all_certificates)
src/capabilities/widget.js        dashboard widget `certificates`
gladys-assistant-integration.json manifest
docs/{en,fr,de,es}.md             user documentation, re-hosted by Gladys (kept in sync)
test/                             node --test; no network (fake checker + SDK fake Gladys)
.github/scripts/changelog-release.mjs  rolls CHANGELOG.md at release time (tested)
```

### Invariants worth knowing

- **External ids are forever.** A device is `gladys.externalIds('certificate',
endpoint.id)` with `endpoint.id = <host>-<port>` (no colon: feature ids are
  `<device>:<feature>`). Feature keys `days_remaining`, `expires_at`, `issuer`,
  trigger, action and widget keys are stored by users: never rename them.
- **Triggers fire on transitions, never per check.** The monitor compares the
  new record with the stored one: expiry level going up, a renewal (new
  fingerprint, later expiry), a new problem. The store is written to `/data` so
  a restart does not re-send alerts.
- **A failed check keeps the certificate.** The expiry level is recomputed from
  the last expiry date read: an unreachable host still gets its "expiring"
  alert.
- **Scene actions never fire triggers** (`record: false`): a scene bound to a
  trigger could start itself. The next recorded round fires the transition.
- **Rounds never overlap**: the monitor queues them.
- **The integration's own timer** drives the checks (hours apart). Gladys
  polling (`should_poll`) is not used: it is once a minute at the slowest.
- **Every feature declares `min`/`max`** (NOT NULL in Gladys), text features
  included.
- **`transports: ["local"]`**: every check is a direct TLS connection from the
  Gladys host, no vendor cloud. The badge is `local`, `unreachable`, or
  `local` + `degraded` for an untrusted certificate.
- **The container rootfs is read-only.** Write only under `/data`. Never log
  credentials (`endpoints.js` drops `user:password@` from pasted URLs).

## Rules

- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag,
  by hand. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`).
  Never write a version heading: the Release workflow moves the section.
- **Manifest.** Every `label`, `description` and `placeholder` is
  `{ en, fr, de, es }`, never a plain string; the catalog `description` holds
  10 to 100 characters per language. `test/manifest.test.js` ties the manifest
  to the code (defaults, action, scene, trigger and widget keys): change both
  sides together.
- **User-facing text** is written in the four languages of `src/i18n.js`:
  action answers, widget, connection status, transport messages, and
  `docs/*.md`, kept in sync.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network: use `test/helpers/fakeChecker.js`
  and `createFakeGladys()` from `@gladysassistant/integration-sdk/testing`.
