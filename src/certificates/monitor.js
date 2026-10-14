// -----------------------------------------------------------------------------
// The check rounds: read every certificate, publish what changed, fire the
// scene triggers on transitions.
//
// Everything that reaches Gladys goes through here, whoever asked for the
// check (the timer, the "Check now" button, the widget, a scene), so the
// device states, the transport badges, the widget and the triggers always
// agree with each other.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { checkCertificate, DAY_MS } from './checker.js';
import { EXPIRY_LEVELS, expiryLevel, expiryRank, problemOf, PROBLEMS } from './levels.js';
import { buildStates, deviceIds } from '../devices/certificate.js';

const logger = createLogger({ name: 'monitor' });

// Scene trigger keys, as declared in the manifest `scene_triggers` field. Keys
// are stored in the users' scenes: never rename them.
export const TRIGGERS = {
  EXPIRING: 'certificate_expiring',
  RENEWED: 'certificate_renewed',
  CHECK_FAILED: 'certificate_check_failed',
};

// Hosts checked at the same time: enough for a long list to take seconds, not
// minutes, without opening a hundred connections at once.
const CONCURRENCY = 5;

// The days remaining change once a day; re-sending an unchanged value once a
// day keeps it recently dated in Gladys without spending the state quota.
const STATE_HEARTBEAT_MS = DAY_MS;

// Gladys accepts at most 100 transport badges per request.
const TRANSPORT_BATCH = 100;

// A scene event string holds at most 1000 characters.
const truncate = (text, max = 1000) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * Run `worker` over `items`, `limit` at a time, keeping the order of the results.
 */
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * @param {object} deps
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} deps.gladys
 * @param {ReturnType<import('./store.js').createStore>} deps.store
 * @param {Function} [deps.check] `checkCertificate`, replaced in the tests
 * @param {() => number} [deps.now]
 * @param {() => void} [deps.afterRound] called once a round is published (widget nudge)
 */
export function createMonitor({
  gladys,
  store,
  check = checkCertificate,
  now = Date.now,
  afterRound,
}) {
  let lastRoundAt = null;
  let queue = Promise.resolve();

  /**
   * The new record of an endpoint, from its previous one and a fresh result.
   */
  function nextRecord(previous, result, config) {
    const at = now();
    let certificate = previous?.certificate ?? null;
    if (result.ok) {
      const { ok: _ok, ...read } = result;
      certificate = read;
    } else if (certificate) {
      // The host did not answer, but its certificate still runs out: count the
      // days from the expiry date last read, so an alert is not missed because
      // the server happened to be down that day.
      certificate = {
        ...certificate,
        daysRemaining: Math.floor((Date.parse(certificate.validTo) - at) / DAY_MS),
      };
    }
    return {
      checkedAt: new Date(at).toISOString(),
      certificate,
      expiryLevel: certificate ? expiryLevel(certificate.daysRemaining, config) : null,
      problem: problemOf(result, config),
      error: result.ok
        ? certificate?.trusted === false
          ? {
              code: certificate.trustError,
              message: `The certificate is not trusted: ${certificate.trustError}`,
            }
          : null
        : { code: result.error, message: result.message },
    };
  }

  /**
   * The scene events a transition from `previous` to `record` calls for. One
   * event per transition, never one per check: a certificate 20 days from its
   * end fires "expiring" once, not twice a day for 20 days.
   */
  function transitionEvents(endpoint, previous, record) {
    const events = [];
    const device = deviceIds(gladys, endpoint).device;
    const certificate = record.certificate;
    const before = previous?.certificate;

    const renewed =
      Boolean(certificate && before) &&
      certificate.fingerprint !== before.fingerprint &&
      Date.parse(certificate.validTo) > Date.parse(before.validTo);
    if (renewed) {
      events.push({
        key: TRIGGERS.RENEWED,
        data: {
          device,
          host: endpoint.label,
          days_remaining: certificate.daysRemaining,
          expires_at: certificate.validTo,
          previous_expires_at: before.validTo,
          issuer: certificate.issuer,
        },
      });
    }

    // After a renewal the new certificate starts from "ok": a renewal for a
    // short-lived certificate already in its warning window is still news.
    const baseline = renewed ? EXPIRY_LEVELS.OK : (previous?.expiryLevel ?? null);
    if (
      record.expiryLevel &&
      record.expiryLevel !== EXPIRY_LEVELS.OK &&
      expiryRank(record.expiryLevel) > expiryRank(baseline)
    ) {
      events.push({
        key: TRIGGERS.EXPIRING,
        data: {
          device,
          host: endpoint.label,
          level: record.expiryLevel,
          days_remaining: certificate.daysRemaining,
          expires_at: certificate.validTo,
          issuer: certificate.issuer,
        },
      });
    }

    if (record.problem && record.problem !== previous?.problem) {
      events.push({
        key: TRIGGERS.CHECK_FAILED,
        data: {
          device,
          host: endpoint.label,
          reason: record.problem,
          error: record.error?.code ?? '',
          message: truncate(record.error?.message ?? ''),
        },
      });
    }
    return events;
  }

  function transportEntry(endpoint, record) {
    const external_id = deviceIds(gladys, endpoint).device;
    if (record.problem === PROBLEMS.UNREACHABLE) {
      return { external_id, transport: DEVICE_TRANSPORTS.UNREACHABLE };
    }
    if (record.problem === PROBLEMS.UNTRUSTED) {
      // It answers, but not the way it should: the orange dot, with the reason.
      const code = record.error?.code ?? '';
      return {
        external_id,
        transport: DEVICE_TRANSPORTS.LOCAL,
        degraded: true,
        message: {
          en: `Certificate not trusted (${code})`,
          fr: `Certificat non reconnu (${code})`,
          de: `Zertifikat nicht vertrauenswürdig (${code})`,
          es: `Certificado no fiable (${code})`,
        },
      };
    }
    return { external_id, transport: DEVICE_TRANSPORTS.LOCAL };
  }

  async function publish(items) {
    const states = items.flatMap(({ endpoint, record }) => buildStates(gladys, endpoint, record));
    if (states.length > 0) {
      try {
        await gladys.publishChangedStates(states, { heartbeat: STATE_HEARTBEAT_MS });
      } catch (error) {
        logger.error('Publishing the certificate states failed', error);
      }
    }
    const entries = items.map(({ endpoint, record }) => transportEntry(endpoint, record));
    for (let start = 0; start < entries.length; start += TRANSPORT_BATCH) {
      try {
        await gladys.publishTransports(entries.slice(start, start + TRANSPORT_BATCH));
      } catch (error) {
        // A badge for a device the user has not created yet may be refused:
        // the states and the triggers matter more, keep going.
        logger.debug(`Publishing the transport badges failed: ${error.message}`);
      }
    }
  }

  async function fire(events) {
    for (const { key, data } of events) {
      try {
        await gladys.publishSceneEvent(key, data);
        logger.info(`Scene event ${key} <- ${data.host}`);
      } catch (error) {
        logger.error(`Scene event ${key} for ${data.host} failed`, error);
      }
    }
  }

  async function runRound(config, endpoints, { record }) {
    const items = await mapLimit(endpoints, CONCURRENCY, async (endpoint) => {
      const result = await check(endpoint, { timeoutMs: config.timeout_seconds * 1000, now });
      const previous = store.get(endpoint.id);
      const next = nextRecord(previous, result, config);
      if (result.ok) {
        logger.debug(`${endpoint.label}: ${next.certificate.daysRemaining} day(s) left`);
      } else {
        logger.warn(`${endpoint.label}: check failed (${result.error}) ${result.message}`);
      }
      return { endpoint, previous, record: next };
    });

    const events = record
      ? items.flatMap(({ endpoint, previous, record: next }) =>
          transitionEvents(endpoint, previous, next),
        )
      : [];
    if (record) {
      for (const { endpoint, record: next } of items) {
        store.set(endpoint.id, next);
      }
      if (endpoints === config.endpoints) {
        store.retain(config.endpoints.map((endpoint) => endpoint.id));
      }
      await store.save();
      lastRoundAt = new Date(now()).toISOString();
    }

    await publish(items);
    await fire(events);
    afterRound?.();
    return items;
  }

  // Rounds run one after the other: a "Check now" pressed during the timer's
  // round waits for it instead of interleaving two sets of transitions.
  function enqueue(task) {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  }

  return {
    TRIGGERS,

    /**
     * Check every configured endpoint.
     *
     * @param {object} config normalized configuration
     * @param {{ record?: boolean }} [options] `record: false` (a scene action)
     *   publishes the fresh states but neither remembers the result nor fires
     *   a trigger: a scene bound to a trigger it fires itself would loop. The
     *   next timed round sees the transition and fires it.
     */
    checkAll(config, { record = true } = {}) {
      return enqueue(() => runRound(config, config.endpoints, { record }));
    },

    /** Check one endpoint (see checkAll for `record`). */
    async checkOne(config, endpoint, { record = true } = {}) {
      const [item] = await enqueue(() => runRound(config, [endpoint], { record }));
      return item;
    },

    /** Publish again what is known of one endpoint (after its device is created). */
    async republish(endpoint) {
      const known = store.get(endpoint.id);
      if (known) {
        await publish([{ endpoint, record: known }]);
      }
    },

    /** The last known record of an endpoint, undefined before its first check. */
    recordOf(endpoint) {
      return store.get(endpoint.id);
    },

    get lastRoundAt() {
      return lastRoundAt;
    },
  };
}
