// -----------------------------------------------------------------------------
// Device type: TLS CERTIFICATE
//
// One Gladys device per endpoint of the configuration (host + port). Its
// features are read-only sensors, refreshed by the integration's own timer
// (see src/certificates/monitor.js), not by Gladys polling: Gladys polls once
// a minute at the slowest, and a certificate is checked a few times a day.
//
//   - days_remaining: whole days before expiry, negative once expired — the
//     feature to chart, and to use in the standard "device state" scene
//     trigger ("days remaining < 15");
//   - expires_at: the expiry date and time, as text (UTC);
//   - issuer: who signed the certificate (Let's Encrypt R11, the NAS itself…).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

export const DEVICE_TYPE = 'certificate';

// Feature keys are part of the external ids: never rename them.
export const FEATURES = {
  DAYS_REMAINING: 'days_remaining',
  EXPIRES_AT: 'expires_at',
  ISSUER: 'issuer',
};

export function deviceIds(gladys, endpoint) {
  return gladys.externalIds(DEVICE_TYPE, endpoint.id);
}

/**
 * The discovery payload of one endpoint.
 *
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {{ id: string, host: string, port: number, label: string }} endpoint
 */
export function buildDevice(gladys, endpoint) {
  const ids = deviceIds(gladys, endpoint);
  return {
    name: endpoint.label,
    external_id: ids.device,
    model: 'TLS certificate',
    params: [
      { name: 'host', value: endpoint.host },
      { name: 'port', value: String(endpoint.port) },
    ],
    features: [
      {
        name: 'Days remaining',
        external_id: ids.feature(FEATURES.DAYS_REMAINING),
        category: DEVICE_FEATURE_CATEGORIES.DURATION,
        type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
        unit: DEVICE_FEATURE_UNITS.DAYS,
        // Gladys stores min/max as NOT NULL. A self-signed certificate can
        // run for decades, an expired one goes negative.
        min: -3650,
        max: 36500,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      },
      {
        name: 'Expiry date',
        external_id: ids.feature(FEATURES.EXPIRES_AT),
        category: DEVICE_FEATURE_CATEGORIES.TEXT,
        type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
        min: 0,
        max: 0,
        read_only: true,
        has_feedback: false,
        keep_history: false,
      },
      {
        name: 'Issuer',
        external_id: ids.feature(FEATURES.ISSUER),
        category: DEVICE_FEATURE_CATEGORIES.TEXT,
        type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
        min: 0,
        max: 0,
        read_only: true,
        has_feedback: false,
        keep_history: false,
      },
    ],
  };
}

/**
 * Every endpoint of the configuration, as discovery payloads.
 */
export function buildDiscoveredDevices(gladys, config) {
  return config.endpoints.map((endpoint) => buildDevice(gladys, endpoint));
}

/**
 * The endpoint a Gladys device stands for, from its external id. Undefined when
 * the host was removed from the configuration since the device was created.
 */
export function findEndpoint(gladys, config, externalId) {
  return config.endpoints.find((endpoint) => deviceIds(gladys, endpoint).device === externalId);
}

/**
 * The expiry date the way the text feature shows it: `2026-11-13 02:31 UTC`.
 */
export function formatExpiry(isoDate) {
  return `${isoDate.slice(0, 10)} ${isoDate.slice(11, 16)} UTC`;
}

/**
 * The states of a stored record, in the `publishStates` format. A failed check
 * keeps the certificate last read: nothing is published for it, so Gladys keeps
 * the last known values instead of blanking them.
 */
export function buildStates(gladys, endpoint, record) {
  if (!record?.certificate) {
    return [];
  }
  const ids = deviceIds(gladys, endpoint);
  const { certificate } = record;
  return [
    {
      device_feature_external_id: ids.feature(FEATURES.DAYS_REMAINING),
      state: certificate.daysRemaining,
    },
    {
      device_feature_external_id: ids.feature(FEATURES.EXPIRES_AT),
      text: formatExpiry(certificate.validTo),
    },
    {
      device_feature_external_id: ids.feature(FEATURES.ISSUER),
      text: certificate.issuer || '?',
    },
  ];
}
