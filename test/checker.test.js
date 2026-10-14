import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  altNames,
  checkCertificate,
  DAY_MS,
  describeCertificate,
  distinguishedName,
} from '../src/certificates/checker.js';

const NOW = Date.parse('2026-10-14T12:00:00.000Z');

const PEER = {
  subject: { CN: 'example.com' },
  issuer: { C: 'US', O: "Let's Encrypt", CN: 'R11' },
  subjectaltname: 'DNS:example.com, DNS:www.example.com, IP Address:10.0.0.1',
  valid_from: 'Aug 15 00:00:00 2026 GMT',
  valid_to: 'Nov 13 12:00:00 2026 GMT',
  fingerprint256: 'AA:BB',
  serialNumber: '0123',
};

// A TLS socket stand-in: what the test makes it emit is what the check sees.
function fakeConnect(script) {
  const calls = [];
  const connect = (options) => {
    const socket = new EventEmitter();
    socket.destroyed = false;
    socket.destroy = () => {
      socket.destroyed = true;
    };
    socket.getProtocol = () => 'TLSv1.3';
    calls.push({ options, socket });
    queueMicrotask(() => script(socket));
    return socket;
  };
  connect.calls = calls;
  return connect;
}

test('a trusted certificate is read and the connection closed', async () => {
  const connect = fakeConnect((socket) => {
    socket.authorized = true;
    socket.getPeerCertificate = () => PEER;
    socket.emit('secureConnect');
  });
  const result = await checkCertificate(
    { host: 'example.com', port: 443 },
    { connect, now: () => NOW },
  );
  assert.equal(result.ok, true);
  assert.equal(result.daysRemaining, 30);
  assert.equal(result.validTo, '2026-11-13T12:00:00.000Z');
  assert.equal(result.issuer, 'R11');
  assert.deepEqual(result.altNames, ['example.com', 'www.example.com', '10.0.0.1']);
  assert.equal(result.trusted, true);
  assert.equal(result.protocol, 'TLSv1.3');
  const [{ options, socket }] = connect.calls;
  assert.equal(options.servername, 'example.com');
  assert.equal(options.rejectUnauthorized, false, 'a bad certificate must still be read');
  assert.equal(socket.destroyed, true);
});

test('an IP address is never sent as SNI', async () => {
  const connect = fakeConnect((socket) => {
    socket.authorized = true;
    socket.getPeerCertificate = () => PEER;
    socket.emit('secureConnect');
  });
  await checkCertificate({ host: '192.168.1.1', port: 443 }, { connect, now: () => NOW });
  assert.equal(connect.calls[0].options.servername, undefined);
});

test('a self-signed certificate is read, and reported as not trusted', async () => {
  const connect = fakeConnect((socket) => {
    socket.authorized = false;
    socket.authorizationError = 'DEPTH_ZERO_SELF_SIGNED_CERT';
    socket.getPeerCertificate = () => PEER;
    socket.emit('secureConnect');
  });
  const result = await checkCertificate(
    { host: 'nas.local', port: 5001 },
    { connect, now: () => NOW },
  );
  assert.equal(result.ok, true);
  assert.equal(result.trusted, false);
  assert.equal(result.trustError, 'DEPTH_ZERO_SELF_SIGNED_CERT');
});

test('an expired certificate is an expiry, not a trust problem', () => {
  const result = describeCertificate(
    { ...PEER, valid_to: 'Oct 10 12:00:00 2026 GMT' },
    { authorized: false, authorizationError: 'CERT_HAS_EXPIRED' },
    NOW,
  );
  assert.equal(result.daysRemaining, -4);
  assert.equal(result.trusted, true);
});

test('a certificate not valid yet is not trusted', () => {
  const result = describeCertificate(
    { ...PEER, valid_from: new Date(NOW + DAY_MS).toUTCString() },
    { authorized: true },
    NOW,
  );
  assert.equal(result.trustError, 'CERT_NOT_YET_VALID');
});

test('the last day counts 0, and the day after -1', () => {
  const at = (hoursLeft) =>
    describeCertificate(
      { ...PEER, valid_to: new Date(NOW + hoursLeft * 3_600_000).toUTCString() },
      { authorized: true },
      NOW,
    ).daysRemaining;
  assert.equal(at(23), 0);
  assert.equal(at(-1), -1);
  assert.equal(at(24 * 365), 365);
});

test('a connection error is a result, never a rejection', async () => {
  const connect = fakeConnect((socket) => {
    socket.emit(
      'error',
      Object.assign(new Error('getaddrinfo ENOTFOUND x'), { code: 'ENOTFOUND' }),
    );
  });
  const result = await checkCertificate({ host: 'x', port: 443 }, { connect });
  assert.deepEqual(result, { ok: false, error: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND x' });
});

test('a server that never answers times out', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const connect = fakeConnect(() => {});
  const pending = checkCertificate({ host: 'x', port: 443 }, { connect, timeoutMs: 5000 });
  t.mock.timers.tick(5000);
  const result = await pending;
  assert.equal(result.error, 'ETIMEDOUT');
  assert.equal(connect.calls[0].socket.destroyed, true);
});

test('a server presenting no certificate is a failure', async () => {
  const connect = fakeConnect((socket) => {
    socket.getPeerCertificate = () => ({});
    socket.emit('secureConnect');
  });
  const result = await checkCertificate({ host: 'x', port: 443 }, { connect });
  assert.equal(result.error, 'CERT_MISSING');
});

test('a connect that throws is a failure too', async () => {
  const connect = () => {
    throw Object.assign(new Error('bad port'), { code: 'ERR_SOCKET_BAD_PORT' });
  };
  const result = await checkCertificate({ host: 'x', port: 443 }, { connect });
  assert.equal(result.error, 'ERR_SOCKET_BAD_PORT');
});

test('names are read from the common name, else the organization', () => {
  assert.equal(distinguishedName({ CN: 'R11', O: 'LE' }), 'R11');
  assert.equal(distinguishedName({ O: 'Synology' }), 'Synology');
  assert.equal(distinguishedName({ CN: ['a', 'b'] }), 'a');
  assert.equal(distinguishedName(undefined), '');
  assert.deepEqual(altNames(undefined), []);
});
