// -----------------------------------------------------------------------------
// Scene actions (Gladys 5.1+).
//
// Each one is declared in the manifest `scene_actions` field and handled here,
// keyed by that same `key`; index.js registers them with
// `gladys.onSceneAction(key, ...)`.
//
//   - check_certificate: check one host now, return its days left and level —
//     "every Monday at 9, check the VPN certificate; if fewer than 15 days,
//     send me a message";
//   - check_all_certificates: check every host now, return the counts.
//
// The scene TRIGGERS are fired by the monitor on transitions (see
// src/certificates/monitor.js). A check run by a scene action never fires one
// (`record: false`): a scene started by "certificate expiring" that checks the
// certificate again would otherwise start itself. The next timed round sees
// the transition and fires it.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { overallLevel } from '../certificates/levels.js';
import { findEndpoint } from '../devices/certificate.js';

const logger = createLogger({ name: 'scenes' });

export const SCENE_ACTION_KEYS = {
  CHECK_CERTIFICATE: 'check_certificate',
  CHECK_ALL: 'check_all_certificates',
};

/**
 * @param {ReturnType<import('../certificates/monitor.js').createMonitor>} monitor
 */
export function createSceneActions(monitor) {
  return {
    async [SCENE_ACTION_KEYS.CHECK_CERTIFICATE](gladys, { fields, config }) {
      logger.info(`Scene action check_certificate <- ${fields.device}`);
      const endpoint = findEndpoint(gladys, config, fields.device);
      if (!endpoint) {
        // Throwing fails this action only: the scene logs it and continues.
        throw new Error('This host is no longer in the integration configuration');
      }
      const { record } = await monitor.checkOne(config, endpoint, { record: false });
      const certificate = record.certificate;
      return {
        // -1 days left is "expired yesterday". With no certificate ever read
        // the output is left out (the scene reads it empty) and `reachable`
        // says why.
        ...(certificate ? { days_remaining: certificate.daysRemaining } : {}),
        expires_at: certificate ? certificate.validTo : '',
        level: overallLevel(record),
        reachable: record.problem !== 'unreachable',
        trusted: certificate ? certificate.trusted : false,
      };
    },

    async [SCENE_ACTION_KEYS.CHECK_ALL](_gladys, { config }) {
      logger.info('Scene action check_all_certificates');
      const items = await monitor.checkAll(config, { record: false });
      const levels = items.map(({ record }) => overallLevel(record));
      return {
        checked: items.length,
        expiring: levels.filter((level) => ['warning', 'critical', 'expired'].includes(level))
          .length,
        problems: levels.filter((level) => ['unreachable', 'untrusted'].includes(level)).length,
      };
    },
  };
}
