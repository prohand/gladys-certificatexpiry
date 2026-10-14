// -----------------------------------------------------------------------------
// Read the certificate an endpoint presents.
//
// One TLS handshake, nothing else: the connection is closed as soon as the
// certificate is in hand, no HTTP request is sent. The handshake never refuses
// a certificate (`rejectUnauthorized: false`): an expired or self-signed one is
// exactly what the user wants to hear about, so it is read and judged here,
// and the verdict of the system CAs is reported next to it, not instead of it.
//
// `checkCertificate` never rejects: an unreachable host is a result too
// (`ok: false` with the error code), which is what the device, the widget and
// the scene trigger report.
// -----------------------------------------------------------------------------

import tls from 'node:tls';
import { isIP } from 'node:net';

export const DAY_MS = 24 * 60 * 60 * 1000;

// Errors OpenSSL reports about the dates of the certificate. The expiry level
// already says it — counting them as a trust problem would report one fact twice.
const DATE_ERRORS = new Set(['CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID']);

function firstOf(value) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The readable name of a certificate subject or issuer: its common name,
 * else its organization.
 */
export function distinguishedName(name) {
  if (!name || typeof name !== 'object') {
    return '';
  }
  return String(firstOf(name.CN) ?? firstOf(name.O) ?? '');
}

/**
 * The DNS names and IP addresses the certificate covers.
 *
 * @param {string} subjectaltname Node's `DNS:a.example, IP Address:10.0.0.1` form
 */
export function altNames(subjectaltname) {
  return String(subjectaltname ?? '')
    .split(',')
    .map((entry) => entry.trim().replace(/^(DNS|IP Address):/, ''))
    .filter(Boolean);
}

/**
 * Turn a peer certificate into the result the integration publishes.
 *
 * @param {object} cert `socket.getPeerCertificate()`
 * @param {{ authorized: boolean, authorizationError?: string|Error, protocol?: string }} socketInfo
 * @param {number} now epoch ms
 */
export function describeCertificate(cert, socketInfo, now) {
  const validFrom = new Date(cert.valid_from);
  const validTo = new Date(cert.valid_to);
  if (Number.isNaN(validTo.getTime())) {
    return { ok: false, error: 'CERT_UNREADABLE', message: 'The certificate has no expiry date' };
  }
  let trustError = socketInfo.authorized ? null : String(socketInfo.authorizationError ?? '');
  if (trustError && DATE_ERRORS.has(trustError)) {
    trustError = null;
  }
  if (!trustError && validFrom.getTime() > now) {
    trustError = 'CERT_NOT_YET_VALID';
  }
  return {
    ok: true,
    validFrom: Number.isNaN(validFrom.getTime()) ? null : validFrom.toISOString(),
    validTo: validTo.toISOString(),
    // Whole days left, rounded down: 0 on the last day, negative once expired.
    daysRemaining: Math.floor((validTo.getTime() - now) / DAY_MS),
    subject: distinguishedName(cert.subject),
    issuer: distinguishedName(cert.issuer),
    altNames: altNames(cert.subjectaltname),
    fingerprint: cert.fingerprint256 ?? null,
    serialNumber: cert.serialNumber ?? null,
    protocol: socketInfo.protocol ?? null,
    trusted: trustError === null,
    trustError,
  };
}

/**
 * Connect to an endpoint and read its certificate.
 *
 * @param {{ host: string, port: number }} endpoint
 * @param {object} [options]
 * @param {number} [options.timeoutMs] the whole handshake must fit in it
 * @param {Function} [options.connect] `tls.connect`, replaced in the tests
 * @param {() => number} [options.now]
 * @returns {Promise<object>} `{ ok: true, ...certificate }` or `{ ok: false, error, message }`
 */
export function checkCertificate(endpoint, options = {}) {
  const { timeoutMs = 10_000, connect = tls.connect, now = Date.now } = options;
  return new Promise((resolve) => {
    let socket;
    let settled = false;
    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket?.destroy();
      resolve(result);
    };
    const fail = (error) =>
      finish({
        ok: false,
        error: error?.code ?? 'TLS_ERROR',
        message: error?.message ?? String(error),
      });

    // One deadline for DNS, TCP and TLS together: a firewall that drops the
    // packets would otherwise hold the check for minutes.
    const timer = setTimeout(
      () =>
        fail(
          Object.assign(new Error(`No TLS answer within ${timeoutMs / 1000} s`), {
            code: 'ETIMEDOUT',
          }),
        ),
      timeoutMs,
    );

    try {
      socket = connect({
        host: endpoint.host,
        port: endpoint.port,
        // SNI carries a name, never an address: Node refuses an IP there.
        servername: isIP(endpoint.host) === 0 ? endpoint.host : undefined,
        rejectUnauthorized: false,
      });
    } catch (error) {
      fail(error);
      return;
    }
    socket.once('error', fail);
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate();
      if (!cert || Object.keys(cert).length === 0) {
        fail(
          Object.assign(new Error('The server presented no certificate'), {
            code: 'CERT_MISSING',
          }),
        );
        return;
      }
      finish(
        describeCertificate(
          cert,
          {
            authorized: socket.authorized,
            authorizationError: socket.authorizationError,
            protocol: socket.getProtocol?.() ?? null,
          },
          now(),
        ),
      );
    });
  });
}
