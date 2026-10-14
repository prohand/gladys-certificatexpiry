import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  endpointId,
  endpointLabel,
  MAX_ENDPOINTS,
  parseEndpoint,
  parseEndpoints,
} from '../src/certificates/endpoints.js';

test('a bare name is checked on 443', () => {
  assert.deepEqual(parseEndpoint('Example.COM'), { host: 'example.com', port: 443 });
});

test('name:port, IPv4 and IPv6 are read', () => {
  assert.deepEqual(parseEndpoint('nas.local:5001'), { host: 'nas.local', port: 5001 });
  assert.deepEqual(parseEndpoint('192.168.1.1:8443'), { host: '192.168.1.1', port: 8443 });
  assert.deepEqual(parseEndpoint('[fe80::1]:8443'), { host: 'fe80::1', port: 8443 });
  assert.deepEqual(parseEndpoint('[2001:db8::1]'), { host: '2001:db8::1', port: 443 });
  assert.deepEqual(parseEndpoint('2001:db8::1'), { host: '2001:db8::1', port: 443 });
});

test('a pasted URL keeps its host and port, never its credentials nor its path', () => {
  assert.deepEqual(parseEndpoint('https://user:secret@example.com:8443/admin?x=1#top'), {
    host: 'example.com',
    port: 8443,
  });
  assert.deepEqual(parseEndpoint('https://example.com/'), { host: 'example.com', port: 443 });
});

test('what is not a host is refused', () => {
  for (const entry of [
    '',
    'host..example',
    'example.com:0',
    'example.com:70000',
    'a b',
    '-x.com',
  ]) {
    assert.equal(parseEndpoint(entry), null, entry);
  }
});

test('labels hide the default port and bracket IPv6', () => {
  assert.equal(endpointLabel({ host: 'example.com', port: 443 }), 'example.com');
  assert.equal(endpointLabel({ host: 'example.com', port: 8443 }), 'example.com:8443');
  assert.equal(endpointLabel({ host: 'fe80::1', port: 443 }), '[fe80::1]');
});

test('ids carry no colon, so feature ids stay `<device>:<feature>`', () => {
  assert.equal(endpointId({ host: 'example.com', port: 443 }), 'example.com-443');
  assert.equal(endpointId({ host: 'fe80::1', port: 8443 }), 'fe80__1-8443');
});

test('the list accepts commas, semicolons, spaces and new lines, and drops duplicates', () => {
  const { endpoints, invalid } = parseEndpoints(
    'example.com, nas.local:5001;router.lan\nexample.com:443  https://example.com bad..host',
  );
  assert.deepEqual(
    endpoints.map((endpoint) => endpoint.label),
    ['example.com', 'nas.local:5001', 'router.lan'],
  );
  assert.deepEqual(invalid, ['bad..host']);
});

test('an unreadable entry is reported without the credentials it carried', () => {
  const { invalid } = parseEndpoints('https://user:secret@bad..host/');
  assert.deepEqual(invalid, ['https://bad..host/']);
});

test('the list stops at the maximum number of endpoints', () => {
  const hosts = Array.from({ length: MAX_ENDPOINTS + 2 }, (_, i) => `h${i}.example`).join(',');
  const { endpoints, invalid } = parseEndpoints(hosts);
  assert.equal(endpoints.length, MAX_ENDPOINTS);
  assert.equal(invalid.length, 2);
});
