// A stand-in for `checkCertificate`: no network, the result of each host is
// set by the test. Unknown hosts answer like a host that is down.

import { DAY_MS } from '../../src/certificates/checker.js';

export const NOW = Date.parse('2026-10-14T12:00:00.000Z');

/**
 * A readable certificate expiring `daysLeft` days after NOW.
 */
export function certificate(daysLeft, overrides = {}) {
  return {
    ok: true,
    validFrom: new Date(NOW - 60 * DAY_MS).toISOString(),
    validTo: new Date(NOW + daysLeft * DAY_MS + 60_000).toISOString(),
    daysRemaining: daysLeft,
    subject: 'example.com',
    issuer: "Let's Encrypt R11",
    altNames: ['example.com'],
    fingerprint: `FP-${daysLeft}`,
    serialNumber: '01',
    protocol: 'TLSv1.3',
    trusted: true,
    trustError: null,
    ...overrides,
  };
}

export function unreachable(code = 'ECONNREFUSED') {
  return { ok: false, error: code, message: `connect ${code}` };
}

export function createFakeChecker(initial = {}) {
  const results = { ...initial };
  const calls = [];
  async function check(endpoint, options) {
    calls.push({ endpoint, options });
    return results[endpoint.label] ?? unreachable();
  }
  check.set = (label, result) => {
    results[label] = result;
  };
  check.calls = calls;
  return check;
}
