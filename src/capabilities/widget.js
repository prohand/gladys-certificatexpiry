// -----------------------------------------------------------------------------
// Dashboard widget "Certificates" (Gladys 5.1+).
//
// The whole fleet on one card: three counters (valid, expiring, problems), the
// most urgent certificates first in a status list, and a "Check now" button.
// The content is declarative (src: the SDK widget vocabulary): the core renders
// it with its own theme and translations, no HTML.
//
// Per-instance settings (manifest `widgets[].settings`):
//   - max_items: how many rows the list shows (1 to 10, the status list cap);
//   - problems_only: hide the certificates that are fine.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { localize, pick } from '../i18n.js';
import { overallLevel, urgency } from '../certificates/levels.js';
import { roundSummary, shortStateText } from '../texts.js';

const logger = createLogger({ name: 'widget' });

// Widget key, as declared in the manifest `widgets` field: never rename it.
export const CERTIFICATES_WIDGET = 'certificates';

// Keys of the `button` actions the content declares.
export const WIDGET_ACTIONS = { CHECK_NOW: 'check_now' };

const DEFAULT_SETTINGS = { max_items: 8, problems_only: false };

const COLORS = {
  ok: WIDGET_COLORS.SUCCESS,
  warning: WIDGET_COLORS.WARNING,
  critical: WIDGET_COLORS.DANGER,
  expired: WIDGET_COLORS.DANGER,
  unreachable: WIDGET_COLORS.DANGER,
  untrusted: WIDGET_COLORS.WARNING,
  unknown: WIDGET_COLORS.NEUTRAL,
};

const ICONS = {
  ok: 'lock',
  warning: 'clock',
  critical: 'alert-triangle',
  expired: 'x-circle',
  unreachable: 'wifi-off',
  untrusted: 'shield-off',
  unknown: 'help-circle',
};

// A status label holds 40 characters.
const fit = (text, max = 40) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function readSettings(settings = {}) {
  const max = Number(settings.max_items);
  return {
    max_items: Number.isFinite(max)
      ? Math.min(10, Math.max(1, Math.round(max)))
      : DEFAULT_SETTINGS.max_items,
    problems_only: settings.problems_only === true,
  };
}

/**
 * The rows of the fleet, most urgent first, then the fewest days left.
 *
 * @param {object} config normalized configuration
 * @param {(endpoint) => object|undefined} recordOf
 */
export function fleet(config, recordOf) {
  return config.endpoints
    .map((endpoint) => {
      const record = recordOf(endpoint);
      return { endpoint, record, level: overallLevel(record) };
    })
    .sort(
      (a, b) =>
        urgency(a.level) - urgency(b.level) ||
        (a.record?.certificate?.daysRemaining ?? Infinity) -
          (b.record?.certificate?.daysRemaining ?? Infinity) ||
        a.endpoint.label.localeCompare(b.endpoint.label),
    );
}

/**
 * @param {ReturnType<import('../certificates/monitor.js').createMonitor>} monitor
 */
export function createWidgets(monitor) {
  return {
    [CERTIFICATES_WIDGET]: {
      async get(_gladys, { settings, config }) {
        logger.debug(`onWidgetGet <- ${CERTIFICATES_WIDGET}`);
        const options = readSettings(settings);
        const rows = fleet(config, (endpoint) => monitor.recordOf(endpoint));
        const count = (levels) => rows.filter((row) => levels.includes(row.level)).length;

        const components = [
          {
            type: 'value',
            label: { en: 'Valid', fr: 'Valides', de: 'Gültig', es: 'Válidos' },
            icon: 'lock',
            value: count(['ok']),
            color: WIDGET_COLORS.SUCCESS,
          },
          {
            type: 'value',
            label: { en: 'Expiring', fr: 'À renouveler', de: 'Laufen ab', es: 'Por renovar' },
            icon: 'clock',
            value: count(['warning', 'critical', 'expired']),
            color:
              count(['critical', 'expired']) > 0 ? WIDGET_COLORS.DANGER : WIDGET_COLORS.WARNING,
          },
          {
            type: 'value',
            label: { en: 'Problems', fr: 'Problèmes', de: 'Probleme', es: 'Problemas' },
            icon: 'alert-triangle',
            value: count(['unreachable', 'untrusted']),
            color: WIDGET_COLORS.DANGER,
          },
        ];

        const shown = rows
          .filter((row) => !options.problems_only || row.level !== 'ok')
          .slice(0, options.max_items);
        if (shown.length > 0) {
          components.push({
            type: 'status',
            items: shown.map(({ endpoint, record, level }) => ({
              label: fit(endpoint.label),
              icon: ICONS[level],
              value: shortStateText(level, record),
              color: COLORS[level],
            })),
          });
        } else {
          components.push({
            type: 'text',
            variant: 'body',
            text:
              rows.length === 0
                ? {
                    en: 'No host to watch yet: add some in the integration configuration.',
                    fr: "Aucun hôte surveillé : ajoutez-en dans la configuration de l'intégration.",
                    de: 'Noch kein Host überwacht: Trage welche in der Konfiguration der Integration ein.',
                    es: 'Ningún host vigilado: añada alguno en la configuración de la integración.',
                  }
                : {
                    en: 'Every certificate is fine.',
                    fr: 'Tous les certificats sont en ordre.',
                    de: 'Alle Zertifikate sind in Ordnung.',
                    es: 'Todos los certificados están bien.',
                  },
          });
        }

        components.push({
          type: 'button',
          label: { en: 'Check now', fr: 'Vérifier', de: 'Jetzt prüfen', es: 'Comprobar' },
          icon: 'refresh-cw',
          style: 'secondary',
          action: { key: WIDGET_ACTIONS.CHECK_NOW },
        });

        // Every round nudges the widget (see index.js): the TTL is a safety net.
        return { ttl_seconds: 1800, components };
      },

      // A successful action makes the core drop the cached content, and every
      // open dashboard re-pulls it: the fresh rows show up without a nudge.
      async action(_gladys, { actionKey, config }) {
        logger.info(`onWidgetAction <- ${CERTIFICATES_WIDGET}.${actionKey}`);
        if (actionKey !== WIDGET_ACTIONS.CHECK_NOW) {
          throw new Error(`Unknown widget action: ${actionKey}`);
        }
        const items = await monitor.checkAll(config);
        if (items.length === 0) {
          return roundSummary(items, overallLevel);
        }
        const problems = items.filter(({ record }) => overallLevel(record) !== 'ok').length;
        // A toast holds 200 characters: the count, not the list.
        return localize((language) =>
          pick(language, {
            en: `${items.length} certificate(s) checked, ${problems} to look at.`,
            fr: `${items.length} certificat(s) vérifié(s), ${problems} à regarder.`,
            de: `${items.length} Zertifikat(e) geprüft, ${problems} zu prüfen.`,
            es: `${items.length} certificado(s) comprobado(s), ${problems} por revisar.`,
          }),
        );
      },
    },
  };
}

/**
 * Freshness nudge: ask the core to re-pull every widget now. Rate-limited
 * core-side (1 per 10 s per widget) and dropped while disconnected.
 */
export function refreshWidgets(gladys, widgets) {
  for (const key of Object.keys(widgets)) {
    gladys.requestWidgetRefresh(key);
  }
}
