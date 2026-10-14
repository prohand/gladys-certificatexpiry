import './helpers/quiet.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../src/certificates/store.js';

async function withDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'certificatexpiry-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('records survive a restart', async (t) => {
  const path = join(await withDir(t), 'certificates.json');
  const first = createStore({ path });
  await first.load();
  first.set('example.com-443', { expiryLevel: 'warning' });
  await first.save();

  const second = createStore({ path });
  await second.load();
  assert.deepEqual(second.get('example.com-443'), { expiryLevel: 'warning' });
});

test('a damaged file starts empty instead of failing', async (t) => {
  const path = join(await withDir(t), 'certificates.json');
  await writeFile(path, '{ not json');
  const store = createStore({ path });
  await store.load();
  assert.deepEqual(store.all(), {});
});

test('retain forgets the hosts removed from the configuration', async () => {
  const store = createStore({ path: null });
  store.set('a', {});
  store.set('b', {});
  store.retain(['b']);
  assert.deepEqual(Object.keys(store.all()), ['b']);
});

test('a directory that cannot be written keeps the records in memory', async (t) => {
  const dir = await withDir(t);
  // A file where the directory should be: mkdir fails.
  await writeFile(join(dir, 'blocked'), '');
  const store = createStore({ path: join(dir, 'blocked', 'certificates.json') });
  store.set('a', { expiryLevel: 'ok' });
  await store.save();
  assert.deepEqual(store.get('a'), { expiryLevel: 'ok' });
});

test('the file is written whole, with its format version', async (t) => {
  const path = join(await withDir(t), 'sub', 'certificates.json');
  const store = createStore({ path });
  store.set('a', { expiryLevel: 'ok' });
  await store.save();
  const saved = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(saved.version, 1);
  assert.deepEqual(saved.records, { a: { expiryLevel: 'ok' } });
});
