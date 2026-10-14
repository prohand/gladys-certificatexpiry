// -----------------------------------------------------------------------------
// What a check result means for the user.
//
// Two separate questions, kept apart on purpose:
//   - the EXPIRY level of the certificate (ok, warning, critical, expired),
//     which only moves with the calendar and with a renewal;
//   - a PROBLEM with the check itself (the host did not answer, or answered
//     with a certificate the system does not trust).
// A host down for an hour does not make its certificate any less valid: the
// expiry level survives a failed check, and the scene triggers fire on each
// question's own transitions.
// -----------------------------------------------------------------------------

export const EXPIRY_LEVELS = {
  OK: 'ok',
  WARNING: 'warning',
  CRITICAL: 'critical',
  EXPIRED: 'expired',
};

export const PROBLEMS = {
  UNREACHABLE: 'unreachable',
  UNTRUSTED: 'untrusted',
};

// The order of gravity, for the transitions and for sorting the widget.
const EXPIRY_RANK = { ok: 0, warning: 1, critical: 2, expired: 3 };

export function expiryRank(level) {
  return EXPIRY_RANK[level] ?? -1;
}

/**
 * The expiry level of a number of days left, under the configured thresholds.
 *
 * @param {number} daysRemaining
 * @param {{ warning_days: number, critical_days: number }} config
 */
export function expiryLevel(daysRemaining, config) {
  if (daysRemaining < 0) {
    return EXPIRY_LEVELS.EXPIRED;
  }
  if (daysRemaining <= config.critical_days) {
    return EXPIRY_LEVELS.CRITICAL;
  }
  if (daysRemaining <= config.warning_days) {
    return EXPIRY_LEVELS.WARNING;
  }
  return EXPIRY_LEVELS.OK;
}

/**
 * The problem a check result reveals, or null.
 *
 * @param {object} result see checker.js
 * @param {{ check_trust: boolean }} config
 */
export function problemOf(result, config) {
  if (!result?.ok) {
    return PROBLEMS.UNREACHABLE;
  }
  if (config.check_trust && !result.trusted) {
    return PROBLEMS.UNTRUSTED;
  }
  return null;
}

/**
 * One word for the overall state of an endpoint, the one the widget colors
 * and the scene action returns: the worst of the two questions.
 *
 * @param {{ expiryLevel?: string|null, problem?: string|null }} record
 * @returns {'unknown'|'ok'|'warning'|'critical'|'expired'|'unreachable'|'untrusted'}
 */
export function overallLevel(record) {
  if (!record) {
    return 'unknown';
  }
  const expiry = record.expiryLevel ?? null;
  if (expiry === EXPIRY_LEVELS.EXPIRED || expiry === EXPIRY_LEVELS.CRITICAL) {
    return expiry;
  }
  if (record.problem) {
    return record.problem;
  }
  return expiry ?? 'unknown';
}

// The widget lists the most urgent first.
const URGENCY = {
  expired: 0,
  critical: 1,
  unreachable: 2,
  untrusted: 3,
  warning: 4,
  unknown: 5,
  ok: 6,
};

export function urgency(level) {
  return URGENCY[level] ?? URGENCY.unknown;
}
