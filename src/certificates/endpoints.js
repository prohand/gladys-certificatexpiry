// -----------------------------------------------------------------------------
// The host list of the configuration, parsed into endpoints.
//
// Users paste what they have at hand: a bare name, `name:port`, an IPv6
// address with or without brackets, or a whole URL copied from the browser.
// Everything is accepted and reduced to `{ host, port }`; what cannot be read
// is returned apart, so the Configuration screen can say which entry is wrong
// instead of silently dropping it.
// -----------------------------------------------------------------------------

import { isIP } from 'node:net';

export const DEFAULT_PORT = 443;

// One device per endpoint, and Gladys accepts at most 100 transport badges per
// request: past that, the list is better split across two installations.
export const MAX_ENDPOINTS = 100;

const HOSTNAME =
  /^(?=.{1,253}$)[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?(?:\.[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?)*$/;

/**
 * Read one entry of the list.
 *
 * @param {string} entry e.g. `example.com`, `nas.local:5001`, `[fe80::1]:8443`,
 *   `https://example.com/path`
 * @returns {{ host: string, port: number } | null} null when it is not readable
 */
export function parseEndpoint(entry) {
  let text = String(entry ?? '').trim();
  if (!text) {
    return null;
  }
  // A pasted URL: keep the authority only.
  text = text.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  text = text.split(/[/?#]/)[0];
  // user:password@host is never a thing to keep (nor to log).
  text = text.slice(text.lastIndexOf('@') + 1);

  let host;
  let portText;
  const bracketed = text.match(/^\[([^\]]+)\](?::(\d*))?$/);
  if (bracketed) {
    [, host, portText] = bracketed;
  } else if ((text.match(/:/g) ?? []).length > 1) {
    // A bare IPv6 address: no port can be told apart from it.
    host = text;
  } else {
    [host, portText] = text.split(':');
  }

  host = host.toLowerCase().replace(/\.$/, '');
  const port = portText ? Number(portText) : DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }
  if (isIP(host) === 0 && !HOSTNAME.test(host)) {
    return null;
  }
  return { host, port };
}

/**
 * The name Gladys shows for an endpoint: the host alone on 443.
 */
export function endpointLabel({ host, port }) {
  const shown = isIP(host) === 6 ? `[${host}]` : host;
  return port === DEFAULT_PORT ? shown : `${shown}:${port}`;
}

/**
 * The stable id of an endpoint, used to build its Gladys external ids. Feature
 * ids are `<device>:<feature>`, so the colons of an IPv6 address must not
 * survive in it.
 */
export function endpointId({ host, port }) {
  return `${host}-${port}`.replace(/[^a-z0-9.-]/g, '_');
}

// An entry is shown back to the user and logged: never with the credentials a
// pasted URL may carry.
function redact(entry) {
  return entry.replace(/^([a-z][a-z0-9+.-]*:\/\/)?[^/@]*@/i, '$1');
}

/**
 * Parse the whole host list: entries are separated by new lines, commas,
 * semicolons or spaces. Duplicates are kept once.
 *
 * @param {string} text the `hosts` field
 * @returns {{ endpoints: Array<{ id, host, port, label }>, invalid: string[] }}
 */
export function parseEndpoints(text) {
  const endpoints = [];
  const invalid = [];
  const seen = new Set();
  for (const entry of String(text ?? '').split(/[\s,;]+/)) {
    if (!entry) {
      continue;
    }
    const parsed = parseEndpoint(entry);
    if (!parsed) {
      invalid.push(redact(entry));
      continue;
    }
    const id = endpointId(parsed);
    if (seen.has(id)) {
      continue;
    }
    if (endpoints.length >= MAX_ENDPOINTS) {
      invalid.push(redact(entry));
      continue;
    }
    seen.add(id);
    endpoints.push({ id, ...parsed, label: endpointLabel(parsed) });
  }
  return { endpoints, invalid };
}
