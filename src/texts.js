// -----------------------------------------------------------------------------
// The words every surface uses for a certificate: the widget rows, the answers
// of the Configuration screen buttons, the connection status. Written once
// here so a level reads the same everywhere, in the four languages of
// src/i18n.js.
// -----------------------------------------------------------------------------

import { localize, pick } from './i18n.js';

// French puts a space before a colon.
const colon = (language) => (language === 'fr' ? ' : ' : ': ');

export function days(language, count) {
  const one = Math.abs(count) === 1;
  return pick(language, {
    en: `${count} ${one ? 'day' : 'days'}`,
    fr: `${count} ${one ? 'jour' : 'jours'}`,
    de: `${count} ${one ? 'Tag' : 'Tage'}`,
    es: `${count} ${one ? 'día' : 'días'}`,
  });
}

const LEVELS = {
  ok: { en: 'Valid', fr: 'Valide', de: 'Gültig', es: 'Válido' },
  warning: {
    en: 'Expiring soon',
    fr: 'Expire bientôt',
    de: 'Läuft bald ab',
    es: 'Caduca pronto',
  },
  critical: { en: 'Critical', fr: 'Critique', de: 'Kritisch', es: 'Crítico' },
  expired: { en: 'Expired', fr: 'Expiré', de: 'Abgelaufen', es: 'Caducado' },
  unreachable: {
    en: 'Unreachable',
    fr: 'Injoignable',
    de: 'Nicht erreichbar',
    es: 'Inaccesible',
  },
  untrusted: {
    en: 'Not trusted',
    fr: 'Non reconnu',
    de: 'Nicht vertrauenswürdig',
    es: 'No fiable',
  },
  unknown: {
    en: 'Not checked yet',
    fr: 'Pas encore vérifié',
    de: 'Noch nicht geprüft',
    es: 'Aún no comprobado',
  },
};

/** The name of an overall level (see levels.js `overallLevel`). */
export function levelName(language, level) {
  return pick(language, LEVELS[level] ?? LEVELS.unknown);
}

/**
 * One short line for an endpoint (≤ 40 characters, the widget status value):
 * the days left, or what prevents knowing them.
 *
 * @param {string} language
 * @param {string} level overall level
 * @param {object|undefined} record see monitor.js
 */
export function shortState(language, level, record) {
  const left = record?.certificate?.daysRemaining;
  if (level === 'expired') {
    return `${levelName(language, level)} (${days(language, -left)})`;
  }
  if (left === undefined || level === 'unknown') {
    return levelName(language, level);
  }
  if (level === 'unreachable' || level === 'untrusted') {
    return `${levelName(language, level)} · ${days(language, left)}`;
  }
  return days(language, left);
}

/** `shortState` in every language. */
export function shortStateText(level, record) {
  return localize((language) => shortState(language, level, record));
}

/**
 * The summary of a round, answered under the "Check now" button.
 *
 * @param {Array<{ endpoint, record }>} items
 * @param {(record) => string} levelOf overall level of a record
 */
export function roundSummary(items, levelOf) {
  if (items.length === 0) {
    return localize((language) =>
      pick(language, {
        en: 'No host to check: add some in the Hosts field, then save.',
        fr: 'Aucun hôte à vérifier : ajoutez-en dans le champ Hôtes, puis enregistrez.',
        de: 'Kein Host zu prüfen: Trage welche im Feld Hosts ein und speichere.',
        es: 'Ningún host que comprobar: añada alguno en el campo Hosts y guarde.',
      }),
    );
  }
  return localize((language) => {
    const head = pick(language, {
      en: `${items.length} host(s) checked:`,
      fr: `${items.length} hôte(s) vérifié(s) :`,
      de: `${items.length} Host(s) geprüft:`,
      es: `${items.length} host(s) comprobado(s):`,
    });
    const lines = items.map(({ endpoint, record }) => {
      const level = levelOf(record);
      const state = ['ok', 'warning', 'critical'].includes(level)
        ? `${levelName(language, level)} · ${days(language, record.certificate.daysRemaining)}`
        : shortState(language, level, record);
      const code = record.problem && record.error?.code ? ` — ${record.error.code}` : '';
      return `- ${endpoint.label}${colon(language)}${state}${code}`;
    });
    return [head, ...lines].join('\n');
  });
}

/**
 * The answer of "Inspect a host": everything read from the certificate.
 *
 * @param {object} endpoint
 * @param {object} result see checker.js
 */
export function inspection(endpoint, result) {
  if (!result.ok) {
    return localize((language) =>
      pick(language, {
        en: `${endpoint.label}: no certificate read (${result.error}). ${result.message}`,
        fr: `${endpoint.label} : aucun certificat lu (${result.error}). ${result.message}`,
        de: `${endpoint.label}: kein Zertifikat gelesen (${result.error}). ${result.message}`,
        es: `${endpoint.label}: ningún certificado leído (${result.error}). ${result.message}`,
      }),
    );
  }
  const names = result.altNames.slice(0, 6).join(', ') + (result.altNames.length > 6 ? ', …' : '');
  return localize((language) => {
    const label = (texts) => pick(language, texts);
    const trust = result.trusted
      ? label({ en: 'yes', fr: 'oui', de: 'ja', es: 'sí' })
      : `${label({ en: 'no', fr: 'non', de: 'nein', es: 'no' })} (${result.trustError})`;
    return [
      `${endpoint.label} — ${
        result.daysRemaining < 0
          ? `${levelName(language, 'expired')} (${days(language, -result.daysRemaining)})`
          : days(language, result.daysRemaining)
      }`,
      `${label({ en: 'Subject', fr: 'Sujet', de: 'Inhaber', es: 'Sujeto' })}${colon(language)}${result.subject || '?'}`,
      `${label({ en: 'Names', fr: 'Noms', de: 'Namen', es: 'Nombres' })}${colon(language)}${names || '?'}`,
      `${label({ en: 'Issuer', fr: 'Émetteur', de: 'Aussteller', es: 'Emisor' })}${colon(language)}${result.issuer || '?'}`,
      `${label({ en: 'Valid from', fr: 'Valide du', de: 'Gültig ab', es: 'Válido desde' })}${colon(language)}${result.validFrom ?? '?'}`,
      `${label({ en: 'Valid until', fr: "Valide jusqu'au", de: 'Gültig bis', es: 'Válido hasta' })}${colon(language)}${result.validTo}`,
      `${label({ en: 'Trusted', fr: 'Reconnu', de: 'Vertrauenswürdig', es: 'Fiable' })}${colon(language)}${trust}`,
      `TLS${colon(language)}${result.protocol ?? '?'}`,
      `SHA-256${colon(language)}${result.fingerprint ?? '?'}`,
    ].join('\n');
  });
}
