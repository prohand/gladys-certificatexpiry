import './helpers/quiet.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { normalizeConfig } from '../src/config.js';
import { createMonitor } from '../src/certificates/monitor.js';
import { createStore } from '../src/certificates/store.js';
import { createSceneActions, SCENE_ACTION_KEYS } from '../src/capabilities/scenes.js';
import { buildDiscoveredDevices } from '../src/devices/certificate.js';
import { certificate, createFakeChecker, NOW, unreachable } from './helpers/fakeChecker.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const declaredOutputs = (key) =>
  manifest.scene_actions.find((entry) => entry.key === key).outputs.map((output) => output.key);

function setup() {
  const gladys = createFakeGladys();
  const check = createFakeChecker({
    'example.com': certificate(12),
    'other.example': certificate(3),
  });
  const monitor = createMonitor({
    gladys,
    store: createStore({ path: null }),
    check,
    now: () => NOW,
  });
  const actions = createSceneActions(monitor);
  const config = normalizeConfig({ hosts: 'example.com, other.example, down.example' });
  const deviceOf = (index) => buildDiscoveredDevices(gladys, config)[index].external_id;
  return { gladys, check, actions, config, deviceOf };
}

test('check_certificate returns the declared outputs of the chosen host', async () => {
  const { gladys, actions, config, deviceOf } = setup();
  const outputs = await actions[SCENE_ACTION_KEYS.CHECK_CERTIFICATE](gladys, {
    fields: { device: deviceOf(0) },
    config,
  });
  assert.deepEqual(outputs, {
    days_remaining: 12,
    expires_at: certificate(12).validTo,
    level: 'warning',
    reachable: true,
    trusted: true,
  });
  for (const key of Object.keys(outputs)) {
    assert.ok(declaredOutputs(SCENE_ACTION_KEYS.CHECK_CERTIFICATE).includes(key), key);
  }
  assert.deepEqual(gladys.fake.sceneEvents, [], 'a scene action never fires a trigger');
});

test('check_certificate of a host never read says it is unreachable', async () => {
  const { gladys, actions, config, deviceOf } = setup();
  const outputs = await actions[SCENE_ACTION_KEYS.CHECK_CERTIFICATE](gladys, {
    fields: { device: deviceOf(2) },
    config,
  });
  assert.equal(outputs.reachable, false);
  assert.equal(outputs.level, 'unreachable');
  assert.equal('days_remaining' in outputs, false);
});

test('check_certificate of a host removed from the configuration fails that action', async () => {
  const { gladys, actions, config } = setup();
  await assert.rejects(
    actions[SCENE_ACTION_KEYS.CHECK_CERTIFICATE](gladys, {
      fields: { device: gladys.externalId('certificate:removed.example-443') },
      config,
    }),
    /no longer in the integration configuration/,
  );
});

test('check_all_certificates counts what needs attention', async () => {
  const { gladys, check, actions, config } = setup();
  check.set('down.example', unreachable());
  const outputs = await actions[SCENE_ACTION_KEYS.CHECK_ALL](gladys, { fields: {}, config });
  assert.deepEqual(outputs, { checked: 3, expiring: 2, problems: 1 });
  for (const key of Object.keys(outputs)) {
    assert.ok(declaredOutputs(SCENE_ACTION_KEYS.CHECK_ALL).includes(key), key);
  }
  assert.deepEqual(gladys.fake.sceneEvents, []);
});
