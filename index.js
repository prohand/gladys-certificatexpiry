// -----------------------------------------------------------------------------
// Entry point of the Certificate Expiry integration.
//
// SDK bootstrap only: the wiring lives in src/app.js (tested against the
// SDK's fake Gladys), the checks in src/certificates/.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const gladys = new GladysIntegration();
const app = createApp(gladys);

// A rejected promise nobody awaited must not take the whole integration down.
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled promise rejection', error);
});

// The SDK disconnects cleanly and exits with code 0 when the supervisor stops
// the container (SIGTERM/SIGINT).
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  app.stop();
});

logger.info('Starting the Certificate Expiry integration...');
gladys.connect().catch((error) => {
  logger.error('Initial connection failed', error);
  process.exit(1);
});
