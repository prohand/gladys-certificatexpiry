import './helpers/quiet.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { normalizeConfig } from '../src/config.js';
import { createMonitor } from '../src/certificates/monitor.js';
import { createStore } from '../src/certificates/store.js';
import { ACTION_KEYS, createActions } from '../src/capabilities/actions.js';
import { LANGUAGES } from '../src/i18n.js';
import { certificate, createFakeChecker, NOW, unreachable } from './helpers/fakeChecker.js';

function setup(hosts) {
  const gladys = createFakeGladys();
  const check = createFakeChecker({
    'example.com': certificate(45),
    'nas.local:5001': certificate(4),
    'ip.example': certificate(-3),
  });
  const monitor = createMonitor({
    gladys,
    store: createStore({ path: null }),
    check,
    now: () => NOW,
  });
  return {
    gladys,
    check,
    actions: createActions(monitor, { check }),
    config: normalizeConfig({ hosts }),
  };
}

test('check_now lists every host with its state, in every language', async () => {
  const { gladys, actions, config } = setup('example.com nas.local:5001 ip.example down.example');
  const answer = await actions[ACTION_KEYS.CHECK_NOW](gladys, { fields: {}, config });
  assert.deepEqual(Object.keys(answer).sort(), [...LANGUAGES].sort());
  assert.equal(
    answer.en,
    [
      '4 host(s) checked:',
      '- example.com: Valid · 45 days',
      '- nas.local:5001: Critical · 4 days',
      '- ip.example: Expired (3 days)',
      '- down.example: Unreachable — ECONNREFUSED',
    ].join('\n'),
  );
  assert.equal(gladys.fake.sceneEvents.length, 3, 'a button press is a round like any other');
});

test('check_now says when there is nothing to check, and which entries it ignored', async () => {
  const empty = setup('');
  const nothing = await empty.actions[ACTION_KEYS.CHECK_NOW](empty.gladys, {
    fields: {},
    config: empty.config,
  });
  assert.match(nothing.en, /No host to check/);

  const typo = setup('example.com, exa mple..com');
  const answer = await typo.actions[ACTION_KEYS.CHECK_NOW](typo.gladys, {
    fields: {},
    config: typo.config,
  });
  assert.match(answer.en, /Ignored \(not a host\): mple\.\.com/);
  assert.match(answer.fr, /Ignoré \(pas un hôte\)/);
});

test('inspect_host shows the whole certificate of any host', async () => {
  const { gladys, check, actions, config } = setup('');
  const answer = await actions[ACTION_KEYS.INSPECT_HOST](gladys, {
    fields: { host: 'https://example.com/login' },
    config,
  });
  assert.match(answer.en, /^example\.com — 45 days\n/);
  assert.match(answer.en, /Issuer: Let's Encrypt R11/);
  assert.match(answer.fr, /Émetteur : Let's Encrypt R11/);
  assert.equal(check.calls.at(-1).options.timeoutMs, config.timeout_seconds * 1000);
  assert.deepEqual(gladys.fake.sceneEvents, [], 'inspecting is not watching');
});

test('inspect_host explains a failure and refuses what is not a host', async () => {
  const { gladys, check, actions, config } = setup('');
  check.set('down.example', unreachable('ENOTFOUND'));
  const down = await actions[ACTION_KEYS.INSPECT_HOST](gladys, {
    fields: { host: 'down.example' },
    config,
  });
  assert.match(down.en, /no certificate read \(ENOTFOUND\)/);
  const bad = await actions[ACTION_KEYS.INSPECT_HOST](gladys, { fields: { host: 'a..b' }, config });
  assert.match(bad.en, /not a host name/);
});
