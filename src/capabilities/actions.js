// -----------------------------------------------------------------------------
// The buttons of the Configuration screen (manifest `actions`).
//
//   - check_now: check every host now and list the result under the button;
//   - inspect_host: read the certificate of ANY host, configured or not, and
//     show everything in it (names, issuer, dates, trust, fingerprint) — the
//     quick look a sysadmin would otherwise take with `openssl s_client`.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { checkCertificate } from '../certificates/checker.js';
import { endpointLabel, parseEndpoint } from '../certificates/endpoints.js';
import { overallLevel } from '../certificates/levels.js';
import { localize, pick } from '../i18n.js';
import { inspection, roundSummary } from '../texts.js';

const logger = createLogger({ name: 'actions' });

export const ACTION_KEYS = {
  CHECK_NOW: 'check_now',
  INSPECT_HOST: 'inspect_host',
};

/**
 * @param {ReturnType<import('../certificates/monitor.js').createMonitor>} monitor
 * @param {object} [options]
 * @param {Function} [options.check] `checkCertificate`, replaced in the tests
 */
export function createActions(monitor, { check = checkCertificate } = {}) {
  return {
    async [ACTION_KEYS.CHECK_NOW](_gladys, { config }) {
      logger.info('Action check_now');
      const items = await monitor.checkAll(config);
      const summary = roundSummary(items, overallLevel);
      if (config.invalidHosts.length === 0) {
        return summary;
      }
      // Say which entries of the Hosts field were not understood.
      const ignored = config.invalidHosts.join(', ');
      return localize(
        (language) =>
          `${summary[language]}\n${pick(language, {
            en: `Ignored (not a host): ${ignored}`,
            fr: `Ignoré (pas un hôte) : ${ignored}`,
            de: `Ignoriert (kein Host): ${ignored}`,
            es: `Ignorado (no es un host): ${ignored}`,
          })}`,
      );
    },

    async [ACTION_KEYS.INSPECT_HOST](_gladys, { fields, config }) {
      const parsed = parseEndpoint(fields.host);
      if (!parsed) {
        return localize((language) =>
          pick(language, {
            en: 'This is not a host name, an address or a URL.',
            fr: "Ce n'est ni un nom d'hôte, ni une adresse, ni une URL.",
            de: 'Das ist weder ein Hostname noch eine Adresse oder URL.',
            es: 'No es un nombre de host, una dirección ni una URL.',
          }),
        );
      }
      const endpoint = { ...parsed, label: endpointLabel(parsed) };
      logger.info(`Action inspect_host <- ${endpoint.label}`);
      const result = await check(endpoint, { timeoutMs: config.timeout_seconds * 1000 });
      return inspection(endpoint, result);
    },
  };
}
