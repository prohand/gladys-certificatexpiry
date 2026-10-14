// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user from the `config_schema` of
// `gladys-assistant-integration.json`. This module provides the defaults and
// normalizes the received object, so the rest of the code never deals with
// `undefined`, strings typed in a number field, or an unparsed host list.
// -----------------------------------------------------------------------------

import { parseEndpoints } from './certificates/endpoints.js';

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  // Hosts to watch, one per line or separated by commas: `host`, `host:port`,
  // `[ipv6]:port`, or a pasted https:// URL.
  hosts: '',
  // Days before expiry from which a certificate is "expiring soon".
  warning_days: 30,
  // Days before expiry from which it is "critical".
  critical_days: 7,
  // Hours between two automatic checks of every host.
  check_interval: 12,
  // Seconds allowed for one TLS handshake.
  timeout_seconds: 10,
  // Report a certificate the system CAs do not trust, or that does not match the
  // host name, as a problem. Off for self-signed certificates on the LAN.
  check_trust: true,
};

const LIMITS = {
  warning_days: { min: 1, max: 365 },
  critical_days: { min: 0, max: 365 },
  check_interval: { min: 1, max: 168 },
  timeout_seconds: { min: 2, max: 60 },
};

function boundedNumber(value, key) {
  const number = Number(value);
  if (value === null || value === '' || !Number.isFinite(number)) {
    return DEFAULT_CONFIG[key];
  }
  const { min, max } = LIMITS[key];
  return Math.min(max, Math.max(min, Math.round(number)));
}

/**
 * Merge the user config with the defaults.
 *
 * @param {Record<string, unknown>} raw config returned by the SDK
 * @returns {typeof DEFAULT_CONFIG & { endpoints: object[], invalidHosts: string[] }}
 */
export function normalizeConfig(raw = {}) {
  const warning = boundedNumber(raw.warning_days ?? DEFAULT_CONFIG.warning_days, 'warning_days');
  // A critical threshold above the warning one would skip the warning level:
  // the critical level is then the warning one.
  const critical = Math.min(
    warning,
    boundedNumber(raw.critical_days ?? DEFAULT_CONFIG.critical_days, 'critical_days'),
  );
  const hosts = typeof raw.hosts === 'string' ? raw.hosts : DEFAULT_CONFIG.hosts;
  const { endpoints, invalid } = parseEndpoints(hosts);
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    hosts,
    warning_days: warning,
    critical_days: critical,
    check_interval: boundedNumber(
      raw.check_interval ?? DEFAULT_CONFIG.check_interval,
      'check_interval',
    ),
    timeout_seconds: boundedNumber(
      raw.timeout_seconds ?? DEFAULT_CONFIG.timeout_seconds,
      'timeout_seconds',
    ),
    // A boolean; anything but an explicit false keeps the safe default.
    check_trust: raw.check_trust !== false,
    endpoints,
    invalidHosts: invalid,
  };
}
