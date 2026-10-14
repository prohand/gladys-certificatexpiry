import './helpers/quiet.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { normalizeConfig } from '../src/config.js';
import { createMonitor } from '../src/certificates/monitor.js';
import { createStore } from '../src/certificates/store.js';
import { CERTIFICATES_WIDGET, createWidgets, refreshWidgets } from '../src/capabilities/widget.js';
import { LANGUAGES } from '../src/i18n.js';
import { certificate, createFakeChecker, NOW, unreachable } from './helpers/fakeChecker.js';

const HOSTS = 'ok.example, soon.example, late.example, gone.example, down.example, self.example';

function setup(hosts = HOSTS) {
  const gladys = createFakeGladys();
  const check = createFakeChecker({
    'ok.example': certificate(200),
    'soon.example': certificate(20),
    'late.example': certificate(3),
    'gone.example': certificate(-2),
    'down.example': unreachable(),
    'self.example': certificate(400, { trusted: false, trustError: 'DEPTH_ZERO_SELF_SIGNED_CERT' }),
  });
  const monitor = createMonitor({
    gladys,
    store: createStore({ path: null }),
    check,
    now: () => NOW,
  });
  const widget = createWidgets(monitor)[CERTIFICATES_WIDGET];
  const config = normalizeConfig({ hosts });
  const get = (settings = {}) =>
    widget.get(gladys, { settings, language: 'en', units: 'metric', config });
  return { gladys, monitor, widget, config, get };
}

test('the content is rendered exactly as sent, before and after a round', async () => {
  const { monitor, config, get } = setup();
  assert.deepEqual(validateWidgetContent(await get()), []);
  await monitor.checkAll(config);
  assert.deepEqual(validateWidgetContent(await get()), []);
  assert.deepEqual(validateWidgetContent(await get({ max_items: 10, problems_only: true })), []);
});

test('the empty states are valid too', async () => {
  const empty = setup('');
  const content = await empty.get();
  assert.deepEqual(validateWidgetContent(content), []);
  assert.ok(content.components.some((component) => component.type === 'text'));

  const fine = setup('ok.example');
  await fine.monitor.checkAll(fine.config);
  const onlyProblems = await fine.get({ problems_only: true });
  assert.deepEqual(validateWidgetContent(onlyProblems), []);
  assert.match(onlyProblems.components.find((c) => c.type === 'text').text.en, /fine/);
});

test('the counters and the list put the most urgent first', async () => {
  const { monitor, config, get } = setup();
  await monitor.checkAll(config);
  const content = await get();
  const tiles = content.components.filter((component) => component.type === 'value');
  assert.deepEqual(
    tiles.map((tile) => tile.value),
    [1, 3, 2],
  );
  const rows = content.components.find((component) => component.type === 'status').items;
  assert.deepEqual(
    rows.map((row) => row.label),
    ['gone.example', 'late.example', 'down.example', 'self.example', 'soon.example', 'ok.example'],
  );
  assert.equal(rows[0].value.en, 'Expired (2 days)');
  assert.equal(rows[4].value.fr, '20 jours');
});

test('the settings limit the rows and can hide what is fine', async () => {
  const { monitor, config, get } = setup();
  await monitor.checkAll(config);
  const rowsOf = async (settings) =>
    (await get(settings)).components.find((component) => component.type === 'status').items;
  assert.equal((await rowsOf({ max_items: 2 })).length, 2);
  assert.equal((await rowsOf({ max_items: 99 })).length, 6);
  assert.ok(!(await rowsOf({ problems_only: true })).some((row) => row.label === 'ok.example'));
});

test('every text of the content is written in every language', async () => {
  const { monitor, config, get } = setup();
  await monitor.checkAll(config);
  const texts = [];
  const walk = (value) => {
    if (value && typeof value === 'object') {
      if ('en' in value) {
        texts.push(value);
      } else {
        Object.values(value).forEach(walk);
      }
    }
  };
  walk(await get());
  assert.ok(texts.length > 0);
  for (const text of texts) {
    assert.deepEqual(Object.keys(text).sort(), [...LANGUAGES].sort(), JSON.stringify(text));
  }
});

test('the Check now button runs a round and answers a short toast', async () => {
  const { gladys, widget, config, get } = setup();
  const [button] = (await get()).components.filter((component) => component.type === 'button');
  const toast = await widget.action(gladys, {
    actionKey: button.action.key,
    params: button.action.params ?? {},
    settings: {},
    config,
  });
  for (const language of LANGUAGES) {
    assert.ok(toast[language].length <= 200, `${language} toast fits in 200 characters`);
  }
  assert.match(toast.en, /6 certificate\(s\) checked, 5 to look at/);
});

test('an unknown widget action fails, so the user sees the error', async () => {
  const { gladys, widget, config } = setup();
  await assert.rejects(
    widget.action(gladys, { actionKey: 'nope', params: {}, settings: {}, config }),
    /Unknown widget action/,
  );
});

test('refreshWidgets nudges every widget', () => {
  const { monitor } = setup();
  const gladys = createFakeGladys();
  const widgets = createWidgets(monitor);
  refreshWidgets(gladys, widgets);
  assert.deepEqual(gladys.fake.widgetRefreshes, Object.keys(widgets));
});
