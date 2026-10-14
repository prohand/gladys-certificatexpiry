import './helpers/quiet.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { normalizeConfig } from '../src/config.js';
import { DAY_MS } from '../src/certificates/checker.js';
import { createMonitor, TRIGGERS } from '../src/certificates/monitor.js';
import { createStore } from '../src/certificates/store.js';
import { buildDiscoveredDevices } from '../src/devices/certificate.js';
import { certificate, createFakeChecker, NOW, unreachable } from './helpers/fakeChecker.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

function setup(results = {}, raw = {}) {
  const gladys = createFakeGladys();
  const check = createFakeChecker(results);
  let now = NOW;
  const clock = { advance: (days) => (now += days * DAY_MS) };
  const store = createStore({ path: null });
  const afterRound = [];
  const monitor = createMonitor({
    gladys,
    store,
    check,
    now: () => now,
    afterRound: () => afterRound.push(now),
  });
  const config = normalizeConfig({ hosts: 'example.com', ...raw });
  return { gladys, check, clock, store, monitor, config, afterRound };
}

const keys = (gladys) => gladys.fake.sceneEvents.map((event) => event.key);

test('a round publishes the states of every host and their transport badge', async () => {
  const { gladys, monitor, config, afterRound } = setup({ 'example.com': certificate(90) });
  await monitor.checkAll(config);
  const id = buildDiscoveredDevices(gladys, config)[0].external_id;
  assert.equal(gladys.fake.lastState(`${id}:days_remaining`), 90);
  assert.match(gladys.fake.lastState(`${id}:expires_at`), /^2027-01-12 12:01 UTC$/);
  assert.equal(gladys.fake.lastState(`${id}:issuer`), "Let's Encrypt R11");
  assert.deepEqual(gladys.fake.transports.at(-1), { device_external_id: id, transport: 'local' });
  assert.equal(afterRound.length, 1, 'the widget is nudged after the round');
  assert.deepEqual(gladys.fake.sceneEvents, [], 'a valid certificate fires nothing');
});

test('expiring fires once per level, not at every round', async () => {
  const { gladys, check, monitor, config } = setup({ 'example.com': certificate(25) });
  await monitor.checkAll(config);
  await monitor.checkAll(config);
  assert.deepEqual(keys(gladys), [TRIGGERS.EXPIRING]);
  assert.equal(gladys.fake.sceneEvents[0].data.level, 'warning');

  check.set('example.com', certificate(5));
  await monitor.checkAll(config);
  check.set('example.com', certificate(4));
  await monitor.checkAll(config);
  assert.deepEqual(
    gladys.fake.sceneEvents.map((event) => event.data.level),
    ['warning', 'critical'],
  );

  check.set('example.com', certificate(-1));
  await monitor.checkAll(config);
  assert.equal(gladys.fake.sceneEvents.at(-1).data.level, 'expired');
  assert.equal(gladys.fake.sceneEvents.at(-1).data.days_remaining, -1);
});

test('a renewal fires renewed, and the next expiry fires again', async () => {
  const { gladys, check, monitor, config } = setup({ 'example.com': certificate(5) });
  await monitor.checkAll(config);
  check.set('example.com', certificate(90));
  await monitor.checkAll(config);
  assert.deepEqual(keys(gladys), [TRIGGERS.EXPIRING, TRIGGERS.RENEWED]);
  const { data } = gladys.fake.sceneEvents[1];
  assert.equal(data.days_remaining, 90);
  assert.ok(Date.parse(data.expires_at) > Date.parse(data.previous_expires_at));

  check.set('example.com', certificate(20));
  // Same certificate read again later: no renewal, a new warning.
  check.set('example.com', certificate(20, { fingerprint: 'FP-90' }));
  await monitor.checkAll(config);
  assert.deepEqual(keys(gladys), [TRIGGERS.EXPIRING, TRIGGERS.RENEWED, TRIGGERS.EXPIRING]);
});

test('a renewal to a short certificate still in its warning window warns again', async () => {
  const { gladys, check, monitor, config } = setup({ 'example.com': certificate(10) });
  await monitor.checkAll(config);
  check.set('example.com', certificate(25));
  await monitor.checkAll(config);
  assert.deepEqual(keys(gladys), [TRIGGERS.EXPIRING, TRIGGERS.RENEWED, TRIGGERS.EXPIRING]);
});

test('a host that stops answering fires check_failed once, and its badge turns unreachable', async () => {
  const { gladys, check, monitor, config } = setup({ 'example.com': certificate(90) });
  await monitor.checkAll(config);
  check.set('example.com', unreachable('ETIMEDOUT'));
  await monitor.checkAll(config);
  await monitor.checkAll(config);
  assert.deepEqual(keys(gladys), [TRIGGERS.CHECK_FAILED]);
  assert.deepEqual(
    {
      reason: gladys.fake.sceneEvents[0].data.reason,
      error: gladys.fake.sceneEvents[0].data.error,
    },
    { reason: 'unreachable', error: 'ETIMEDOUT' },
  );
  assert.equal(gladys.fake.transports.at(-1).transport, 'unreachable');
  // Back online, then down again: a new problem.
  check.set('example.com', certificate(89));
  await monitor.checkAll(config);
  check.set('example.com', unreachable());
  await monitor.checkAll(config);
  assert.deepEqual(keys(gladys), [TRIGGERS.CHECK_FAILED, TRIGGERS.CHECK_FAILED]);
});

test('a certificate keeps counting down while its host is down', async () => {
  const { gladys, check, clock, monitor, config } = setup({ 'example.com': certificate(32) });
  await monitor.checkAll(config);
  check.set('example.com', unreachable());
  clock.advance(3);
  const [{ record }] = await monitor.checkAll(config);
  assert.equal(record.certificate.daysRemaining, 29);
  assert.equal(record.expiryLevel, 'warning');
  assert.deepEqual(keys(gladys), [TRIGGERS.EXPIRING, TRIGGERS.CHECK_FAILED]);
});

test('an untrusted certificate is a problem only when the trust check is on', async () => {
  const selfSigned = certificate(300, {
    trusted: false,
    trustError: 'DEPTH_ZERO_SELF_SIGNED_CERT',
  });
  const on = setup({ 'example.com': selfSigned });
  await on.monitor.checkAll(on.config);
  assert.deepEqual(keys(on.gladys), [TRIGGERS.CHECK_FAILED]);
  assert.equal(on.gladys.fake.sceneEvents[0].data.reason, 'untrusted');
  const badge = on.gladys.fake.transports.at(-1);
  assert.equal(badge.degraded, true);
  assert.match(badge.message.en, /DEPTH_ZERO_SELF_SIGNED_CERT/);

  const off = setup({ 'example.com': selfSigned }, { check_trust: false });
  await off.monitor.checkAll(off.config);
  assert.deepEqual(keys(off.gladys), []);
  assert.equal(off.gladys.fake.transports.at(-1).degraded, undefined);
});

test('a check without record publishes, but neither remembers nor fires', async () => {
  const { gladys, check, monitor, config, store } = setup({ 'example.com': certificate(90) });
  await monitor.checkAll(config);
  check.set('example.com', certificate(5));
  const [{ record }] = await monitor.checkAll(config, { record: false });
  assert.equal(record.expiryLevel, 'critical');
  assert.deepEqual(keys(gladys), [], 'a scene action never fires a trigger');
  assert.equal(store.get('example.com-443').expiryLevel, 'ok');
  const id = buildDiscoveredDevices(gladys, config)[0].external_id;
  assert.equal(gladys.fake.lastState(`${id}:days_remaining`), 5);
  // The next recorded round sees the transition and fires it.
  await monitor.checkAll(config);
  assert.deepEqual(keys(gladys), [TRIGGERS.EXPIRING]);
});

test('the scene event data only carries the keys the trigger declares', async () => {
  const { gladys, check, monitor, config } = setup({ 'example.com': certificate(5) });
  await monitor.checkAll(config);
  check.set('example.com', certificate(90));
  await monitor.checkAll(config);
  check.set('example.com', unreachable());
  await monitor.checkAll(config);
  assert.deepEqual(keys(gladys), [TRIGGERS.EXPIRING, TRIGGERS.RENEWED, TRIGGERS.CHECK_FAILED]);
  for (const { key, data } of gladys.fake.sceneEvents) {
    const trigger = manifest.scene_triggers.find((entry) => entry.key === key);
    const declared = [...trigger.fields, ...trigger.variables].map((entry) => entry.key);
    for (const [name, value] of Object.entries(data)) {
      assert.ok(declared.includes(name), `${key}: data.${name} is not declared`);
      assert.ok(value === null || typeof value !== 'object', `${key}: data.${name} is flat`);
    }
    // Every filter option the trigger offers is a value the data can carry.
    for (const field of trigger.fields.filter((entry) => entry.options)) {
      assert.ok(
        field.options.some((option) => option.value === data[field.key]),
        `${key}: data.${field.key} "${data[field.key]}" is not one of the filter options`,
      );
    }
  }
});

test('hosts removed from the configuration are forgotten', async () => {
  const { monitor, store } = setup({
    'example.com': certificate(90),
    'other.example': certificate(90),
  });
  await monitor.checkAll(normalizeConfig({ hosts: 'example.com, other.example' }));
  await monitor.checkAll(normalizeConfig({ hosts: 'other.example' }));
  assert.deepEqual(Object.keys(store.all()), ['other.example-443']);
});

test('rounds never overlap', async () => {
  const { monitor, config } = setup();
  let running = 0;
  let overlap = false;
  const slow = createMonitor({
    gladys: createFakeGladys(),
    store: createStore({ path: null }),
    check: async () => {
      running += 1;
      overlap ||= running > 1;
      await new Promise((resolve) => setImmediate(resolve));
      running -= 1;
      return certificate(90);
    },
  });
  await Promise.all([slow.checkAll(config), slow.checkAll(config), monitor.checkAll(config)]);
  assert.equal(overlap, false);
});

test('a failing state publication does not stop the triggers', async (t) => {
  const { gladys, monitor, config } = setup({ 'example.com': certificate(3) });
  t.mock.method(gladys, 'publishChangedStates', async () => {
    throw new Error('429');
  });
  await monitor.checkAll(config);
  assert.deepEqual(keys(gladys), [TRIGGERS.EXPIRING]);
});

test('republish sends the known states of one host again', async () => {
  const { gladys, monitor, config } = setup({ 'example.com': certificate(90) });
  await monitor.checkAll(config);
  gladys.forgetPublishedStates();
  const before = gladys.fake.states.length;
  await monitor.republish(config.endpoints[0]);
  assert.equal(gladys.fake.states.length, before + 3);
});
