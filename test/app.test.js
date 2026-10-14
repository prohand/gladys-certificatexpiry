import './helpers/quiet.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../src/app.js';
import { createStore } from '../src/certificates/store.js';
import { DAY_MS } from '../src/certificates/checker.js';
import { certificate, createFakeChecker, NOW } from './helpers/fakeChecker.js';

const HOUR_MS = 60 * 60 * 1000;

function setup(config = { hosts: 'example.com, nas.local:5001' }, results = {}) {
  const gladys = createFakeGladys({ config });
  const check = createFakeChecker({
    'example.com': certificate(20),
    'nas.local:5001': certificate(300),
    ...results,
  });
  let now = NOW;
  const app = createApp(gladys, {
    store: createStore({ path: null }),
    check,
    now: () => now,
  });
  return {
    gladys,
    check,
    app,
    advance: (ms) => (now += ms),
  };
}

test('on connection: devices discovered, first round run, status connected', async (t) => {
  const { gladys, app } = setup();
  t.after(() => app.stop());
  await gladys.connect();
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.name),
    ['example.com', 'nas.local:5001'],
  );
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  assert.deepEqual(
    gladys.fake.sceneEvents.map((event) => event.key),
    ['certificate_expiring'],
  );
  assert.ok(gladys.fake.widgetRefreshes.includes('certificates'));
  assert.equal(app.scheduled, true, 'the next round is scheduled');
  await gladys.disconnect();
  assert.equal(app.scheduled, false, 'no round while Gladys is unreachable');
});

test('without any host the Configuration screen says what to do', async (t) => {
  const { gladys, app, check } = setup({ hosts: '' });
  t.after(() => app.stop());
  await gladys.connect();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /No host to watch/);
  assert.equal(check.calls.length, 0);
  await gladys.disconnect();
});

test('a saved configuration publishes the new hosts and checks them at once', async (t) => {
  const { gladys, app, check } = setup();
  t.after(() => app.stop());
  await gladys.connect();
  const before = check.calls.length;
  await gladys.fake.configUpdated({ hosts: 'example.com, router.lan:8443', warning_days: 10 });
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.name),
    ['example.com', 'router.lan:8443'],
  );
  assert.equal(check.calls.length, before + 2);
  assert.equal(app.config.warning_days, 10);
  await gladys.disconnect();
});

test('a reconnection soon after a round does not check again', async (t) => {
  const { gladys, app, check, advance } = setup();
  t.after(() => app.stop());
  await gladys.connect();
  const after = check.calls.length;
  await gladys.disconnect();
  advance(HOUR_MS);
  await gladys.connect();
  assert.equal(check.calls.length, after, 'the last round is an hour old');
  assert.equal(app.scheduled, true);
  await gladys.disconnect();
  advance(DAY_MS);
  await gladys.connect();
  assert.equal(check.calls.length, after * 2, 'a day later, the round runs again');
  await gladys.disconnect();
});

test('the timer runs the next round after the check interval', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { gladys, app, check } = setup({ hosts: 'example.com', check_interval: 2 });
  t.after(() => app.stop());
  await gladys.connect();
  assert.equal(check.calls.length, 1);
  t.mock.timers.tick(2 * HOUR_MS);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(check.calls.length, 2);
  await gladys.disconnect();
});

test('a device created in Gladys gets its known states at once', async (t) => {
  const { gladys, app } = setup();
  t.after(() => app.stop());
  await gladys.connect();
  const [device] = gladys.fake.discoveredDevices;
  const before = gladys.fake.states.length;
  await gladys.fake.deviceCreated(device);
  assert.equal(gladys.fake.states.length, before + 3);
  await gladys.disconnect();
});

test('every manifest surface answers through the Gladys wiring', async (t) => {
  const { gladys, app } = setup();
  t.after(() => app.stop());
  await gladys.connect();
  const [device] = gladys.fake.discoveredDevices;

  const scan = await gladys.fake.scanRequest();
  assert.equal(scan, undefined);

  const checkNow = await gladys.fake.action('check_now', {});
  assert.equal(checkNow.success, true);
  const inspect = await gladys.fake.action('inspect_host', { host: 'example.com' });
  assert.equal(inspect.success, true);

  const scene = await gladys.fake.sceneAction('check_certificate', { device: device.external_id });
  assert.deepEqual(scene.success, true);
  assert.equal(scene.data.outputs.days_remaining, 20);

  const widget = await gladys.fake.widgetGet('certificates', {
    settings: {},
    language: 'de',
    units: 'metric',
  });
  assert.equal(widget.success, true);
  const tap = await gladys.fake.widgetAction('certificates', 'check_now', {}, { settings: {} });
  assert.equal(tap.success, true);
  await gladys.disconnect();
});

test('a failed initialization is shown on the Configuration screen', async (t) => {
  const { gladys, app } = setup();
  t.after(() => app.stop());
  t.mock.method(gladys, 'publishDiscoveredDevices', async () => {
    throw new Error('Gladys said no');
  });
  await gladys.connect();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /Initialization failed/);
  await gladys.disconnect();
});
