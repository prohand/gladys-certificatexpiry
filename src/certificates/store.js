// -----------------------------------------------------------------------------
// What the integration remembers about each endpoint, across restarts.
//
// The scene triggers fire on TRANSITIONS ("this certificate just entered its
// last 30 days"). Without memory, every restart of the container (an update,
// a reboot of the Gladys host) would be a transition for every certificate
// already close to its end, and the user would get the same alert again. So
// the last known state is written to /data, the one writable volume of the
// container. If it cannot be written (a development run without /data), the
// integration keeps working from memory and says so once.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'store' });

export const DEFAULT_STORE_PATH = join(process.env.DATA_DIR ?? '/data', 'certificates.json');

const FORMAT_VERSION = 1;

/**
 * @param {object} [options]
 * @param {string|null} [options.path] the JSON file; null keeps everything in memory
 */
export function createStore({ path = DEFAULT_STORE_PATH } = {}) {
  let records = {};
  let writeWarned = false;
  let writing = Promise.resolve();

  return {
    /** Read the file, if any. A missing or damaged file starts empty. */
    async load() {
      if (!path) {
        return;
      }
      try {
        const parsed = JSON.parse(await readFile(path, 'utf8'));
        records = parsed?.version === FORMAT_VERSION && parsed.records ? parsed.records : {};
      } catch (error) {
        if (error.code !== 'ENOENT') {
          logger.warn(`Could not read ${path}, starting from scratch: ${error.message}`);
        }
        records = {};
      }
    },

    get(id) {
      return records[id];
    },

    set(id, record) {
      records[id] = record;
    },

    /** Forget the endpoints that are no longer configured. */
    retain(ids) {
      const keep = new Set(ids);
      for (const id of Object.keys(records)) {
        if (!keep.has(id)) {
          delete records[id];
        }
      }
    },

    all() {
      return { ...records };
    },

    /**
     * Write the file. Writes are serialized, and go through a temporary file
     * renamed in place, so a crash mid-write never leaves half a JSON behind.
     */
    save() {
      if (!path) {
        return Promise.resolve();
      }
      const snapshot = JSON.stringify({ version: FORMAT_VERSION, records }, null, 2);
      writing = writing.then(async () => {
        try {
          await mkdir(dirname(path), { recursive: true });
          const temporary = `${path}.tmp`;
          await writeFile(temporary, snapshot, 'utf8');
          await rename(temporary, path);
        } catch (error) {
          if (!writeWarned) {
            writeWarned = true;
            logger.warn(
              `Could not write ${path} (${error.code ?? error.message}): alerts may be sent again after a restart`,
            );
          }
        }
      });
      return writing;
    },
  };
}
