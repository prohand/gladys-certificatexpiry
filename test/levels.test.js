import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig } from '../src/config.js';
import { expiryLevel, overallLevel, problemOf, urgency } from '../src/certificates/levels.js';
import { certificate, unreachable } from './helpers/fakeChecker.js';

const config = normalizeConfig({ warning_days: 30, critical_days: 7 });

test('the expiry level follows the thresholds, both included', () => {
  assert.equal(expiryLevel(31, config), 'ok');
  assert.equal(expiryLevel(30, config), 'warning');
  assert.equal(expiryLevel(8, config), 'warning');
  assert.equal(expiryLevel(7, config), 'critical');
  assert.equal(expiryLevel(0, config), 'critical');
  assert.equal(expiryLevel(-1, config), 'expired');
});

test('a problem is an unreachable host or, when asked, an untrusted certificate', () => {
  const selfSigned = certificate(100, {
    trusted: false,
    trustError: 'DEPTH_ZERO_SELF_SIGNED_CERT',
  });
  assert.equal(problemOf(unreachable(), config), 'unreachable');
  assert.equal(problemOf(selfSigned, config), 'untrusted');
  assert.equal(problemOf(selfSigned, normalizeConfig({ check_trust: false })), null);
  assert.equal(problemOf(certificate(100), config), null);
});

test('the overall level is the worst of the expiry and the problem', () => {
  assert.equal(overallLevel(undefined), 'unknown');
  assert.equal(overallLevel({ expiryLevel: 'ok', problem: null }), 'ok');
  assert.equal(overallLevel({ expiryLevel: 'warning', problem: 'unreachable' }), 'unreachable');
  assert.equal(overallLevel({ expiryLevel: 'critical', problem: 'unreachable' }), 'critical');
  assert.equal(overallLevel({ expiryLevel: null, problem: 'unreachable' }), 'unreachable');
});

test('the most urgent levels sort first', () => {
  const sorted = [
    'ok',
    'warning',
    'unknown',
    'untrusted',
    'expired',
    'unreachable',
    'critical',
  ].sort((a, b) => urgency(a) - urgency(b));
  assert.deepEqual(sorted, [
    'expired',
    'critical',
    'unreachable',
    'untrusted',
    'warning',
    'unknown',
    'ok',
  ]);
});
