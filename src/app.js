// -----------------------------------------------------------------------------
// The integration, wired to a Gladys client.
//
// index.js passes the real SDK client; the tests pass the SDK's fake Gladys
// (`createFakeGladys()`), so the wiring itself is tested, not only the parts.
// Every handler is registered here, before `connect()`.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { checkCertificate } from './certificates/checker.js';
import { createMonitor } from './certificates/monitor.js';
import { createStore } from './certificates/store.js';
import { buildDiscoveredDevices, findEndpoint } from './devices/certificate.js';
import { createActions } from './capabilities/actions.js';
import { createSceneActions } from './capabilities/scenes.js';
import { createWidgets, refreshWidgets } from './capabilities/widget.js';

const logger = createLogger({ name: 'app' });

const HOUR_MS = 60 * 60 * 1000;

/**
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {object} [options]
 * @param {ReturnType<typeof createStore>} [options.store]
 * @param {Function} [options.check] `checkCertificate`, replaced in the tests
 * @param {() => number} [options.now]
 */
export function createApp(gladys, options = {}) {
  const { store = createStore(), check = checkCertificate, now = Date.now } = options;

  let config = normalizeConfig();
  let timer = null;
  let storeLoaded = false;

  const monitor = createMonitor({
    gladys,
    store,
    check,
    now,
    // Every round changes what the widget shows: nudge it instead of waiting
    // for its TTL.
    afterRound: () => refreshWidgets(gladys, widgets),
  });
  const widgets = createWidgets(monitor);
  const sceneActions = createSceneActions(monitor);
  const actions = createActions(monitor, { check });

  // --- Timer --------------------------------------------------------------
  // Gladys polls once a minute at the slowest: a certificate is checked a few
  // times a day, by the integration's own timer.
  function stopTimer() {
    clearTimeout(timer);
    timer = null;
  }

  function schedule(delayMs) {
    stopTimer();
    timer = setTimeout(runScheduledRound, delayMs);
    timer.unref?.();
  }

  async function runScheduledRound() {
    timer = null;
    try {
      await monitor.checkAll(config);
    } catch (error) {
      logger.error('Check round failed', error);
    }
    if (gladys.connected !== false) {
      schedule(config.check_interval * HOUR_MS);
    }
  }

  // --- Configuration ------------------------------------------------------
  async function publishConnectionStatus() {
    if (config.invalidHosts.length > 0) {
      logger.warn(`Ignored host entries: ${config.invalidHosts.join(', ')}`);
    }
    if (config.endpoints.length === 0) {
      await gladys.setConnectionStatus(false, {
        en: 'No host to watch: add at least one in the Hosts field.',
        fr: 'Aucun hôte à surveiller : ajoutez-en au moins un dans le champ Hôtes.',
        de: 'Kein Host zu überwachen: Trage mindestens einen im Feld Hosts ein.',
        es: 'Ningún host que vigilar: añada al menos uno en el campo Hosts.',
      });
      return;
    }
    await gladys.setConnectionStatus(true);
  }

  async function applyConfig(raw) {
    config = normalizeConfig(raw);
    // Idempotent upsert by external_id: a host added shows up in Discovery.
    await gladys.publishDiscoveredDevices(buildDiscoveredDevices(gladys, config));
    await publishConnectionStatus();
  }

  // --- Handlers -----------------------------------------------------------
  gladys.onScanRequest(async () => {
    logger.info('onScanRequest -> publishing the configured hosts');
    await gladys.publishDiscoveredDevices(buildDiscoveredDevices(gladys, config));
  });

  // Gladys drops the states of a device that does not exist yet: once the user
  // creates it, send what is already known instead of waiting for the next round.
  gladys.onDeviceCreated(async (device) => {
    const endpoint = findEndpoint(gladys, config, device.external_id);
    if (endpoint) {
      await monitor.republish(endpoint);
    }
  });

  for (const [key, handler] of Object.entries(actions)) {
    gladys.onAction(key, (fields) => handler(gladys, { fields, config }));
  }

  for (const [key, handler] of Object.entries(sceneActions)) {
    gladys.onSceneAction(key, (fields) => handler(gladys, { fields, config }));
  }

  for (const [key, widget] of Object.entries(widgets)) {
    gladys.onWidgetGet(key, (request) => widget.get(gladys, { ...request, config }));
    gladys.onWidgetAction(key, (actionKey, params, { settings }) =>
      widget.action(gladys, { actionKey, params, settings, config }),
    );
  }

  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('onConfigUpdated -> new configuration received');
    await applyConfig(newConfig);
    // A host added or a threshold changed: check now, not in twelve hours.
    stopTimer();
    await runScheduledRound();
  });

  // --- Lifecycle ----------------------------------------------------------
  gladys.on('connected', async () => {
    try {
      if (!storeLoaded) {
        await store.load();
        storeLoaded = true;
      }
      await applyConfig(await gladys.getConfig());
      // A reconnection (Gladys restarted) does not need a new round when the
      // last one is recent: wait for the rest of the interval instead.
      const intervalMs = config.check_interval * HOUR_MS;
      const last = monitor.lastRoundAt ? Date.parse(monitor.lastRoundAt) : null;
      if (last !== null && now() - last < intervalMs) {
        schedule(intervalMs - (now() - last));
        refreshWidgets(gladys, widgets);
      } else {
        await runScheduledRound();
      }
    } catch (error) {
      logger.error('Post-connection initialization failed', error);
      await gladys
        .setConnectionStatus(false, {
          en: 'Initialization failed, check the integration logs.',
          fr: "L'initialisation a échoué, consultez les journaux de l'intégration.",
          de: 'Die Initialisierung ist fehlgeschlagen, sieh in die Protokolle der Integration.',
          es: 'La inicialización ha fallado, consulte los registros de la integración.',
        })
        .catch(() => {});
    }
  });

  gladys.on('disconnected', () => {
    stopTimer();
  });

  return {
    monitor,
    widgets,
    sceneActions,
    actions,
    get config() {
      return config;
    },
    get scheduled() {
      return timer !== null;
    },
    stop: stopTimer,
  };
}
