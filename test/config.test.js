import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig } from '../src/config.js';

test('an empty config gets the defaults and no endpoint', () => {
  const config = normalizeConfig();
  for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
    assert.equal(config[key], value, key);
  }
  assert.deepEqual(config.endpoints, []);
  assert.deepEqual(config.invalidHosts, []);
});

test('numbers typed as strings are read, and kept within the manifest bounds', () => {
  const config = normalizeConfig({
    warning_days: '45',
    critical_days: '10',
    check_interval: 1000,
    timeout_seconds: 0,
  });
  assert.equal(config.warning_days, 45);
  assert.equal(config.critical_days, 10);
  assert.equal(config.check_interval, 168);
  assert.equal(config.timeout_seconds, 2);
});

test('an empty or unreadable number falls back to its default', () => {
  const config = normalizeConfig({ warning_days: '', check_interval: 'often' });
  assert.equal(config.warning_days, DEFAULT_CONFIG.warning_days);
  assert.equal(config.check_interval, DEFAULT_CONFIG.check_interval);
});

test('a critical threshold above the warning one is brought down to it', () => {
  const config = normalizeConfig({ warning_days: 10, critical_days: 20 });
  assert.equal(config.critical_days, 10);
});

test('the trust check is only off when explicitly turned off', () => {
  assert.equal(normalizeConfig({ check_trust: false }).check_trust, false);
  assert.equal(normalizeConfig({ check_trust: undefined }).check_trust, true);
});

test('the host list is parsed into endpoints', () => {
  const config = normalizeConfig({ hosts: 'example.com, nas.local:5001, nope..x' });
  assert.deepEqual(
    config.endpoints.map((endpoint) => endpoint.label),
    ['example.com', 'nas.local:5001'],
  );
  assert.deepEqual(config.invalidHosts, ['nope..x']);
});
