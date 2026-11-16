import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadWithLegacy } from '../src/core/legacy-import';
import { Store, defaults, parseData } from '../src/core/storage';
import type { SavedData } from '../src/core/types';

function fixture(legacy?: string, current?: unknown) {
  let present = current !== undefined; let disk = current; let writes = 0; let reads = 0;
  let failure: 'none' | 'before' | 'partial' | 'after' = 'none';
  const configDir = 'custom-config/nested';
  const port = {
    configDir,
    adapter: {
      exists: async (path: string) => {
        assert.ok(path.startsWith(configDir + '/plugins/'));
        return path.includes('/brumalt/') ? present : legacy !== undefined;
      },
      read: async (path: string) => { assert.equal(path, configDir + '/plugins/casual-memory-games/data.json'); reads++; return legacy!; },
    },
    readCurrent: async () => disk,
    writeCurrent: async (data: SavedData) => {
      writes++;
      if (failure === 'before') throw new Error('disk');
      present = true; disk = failure === 'partial' ? { broken: true } : structuredClone(data);
      if (failure !== 'none') throw new Error('disk');
    },
  };
  return { port, writes: () => writes, reads: () => reads, disk: () => disk,
    fail: (value: typeof failure) => { failure = value; }, removeBrokenCopy: () => { present = false; disk = undefined; },
    appear: (data: unknown) => { present = true; disk = data; } };
}

for (const version of [1, 2, 3, 4]) test(`Legacy import schema ${version}: preserve source, settings/history/levels/activity, one write and no duplicate on restart`, async () => {
  const source = JSON.parse(await readFile(`tests/fixtures/data-v${Math.min(3, version)}.json`, 'utf8'));
  const original = JSON.stringify(version === 4 ? parseData(source) : source);
  const f = fixture(original); const expected = parseData(JSON.parse(original));
  const imported = await loadWithLegacy(f.port);
  assert.equal(imported.imported, true); assert.deepEqual(imported.data, expected); assert.equal(f.writes(), 1);
  assert.deepEqual(f.disk(), expected); assert.equal(await f.port.adapter.read(f.port.configDir + '/plugins/casual-memory-games/data.json'), original);
  const reopened = await loadWithLegacy(f.port); assert.equal(reopened.imported, false); assert.deepEqual(reopened.data, expected);
  const store = new Store({ read: async () => (await loadWithLegacy(f.port)).data, write: f.port.writeCurrent });
  await store.load(); assert.equal(store.loadError, null);
  if (store.data.history[0]) assert.equal(await store.record(store.data.history[0]), false);
  assert.equal(f.writes(), 1); assert.deepEqual(store.data, expected);
});

test('Legacy import: new files win, even empty/corrupt files; no merge or automatic overwrite', async () => {
  for (const current of [defaults(), null, {}, '']) {
    const f = fixture('{corrupt legacy', current);
    const store = new Store({ read: async () => (await loadWithLegacy(f.port)).data, write: f.port.writeCurrent });
    await store.load(); assert.equal(f.reads(), 0); assert.equal(f.writes(), 0); assert.deepEqual(f.disk(), current);
    if (current === null || typeof current !== 'object' || !('schemaVersion' in current)) {
      assert.equal(store.loadError, 'loadFailed'); await assert.rejects(store.setMinutes(5));
      assert.equal(f.writes(), 0);
    } else assert.equal(store.loadError, null);
  }
});

test('Legacy import: absent source starts fresh without a write; malformed/unsupported source blocks all writes', async () => {
  const empty = fixture(); assert.deepEqual(await loadWithLegacy(empty.port), { data: null, imported: false }); assert.equal(empty.writes(), 0);
  for (const source of ['', '{', 'null', '42', '{"schemaVersion":999}', JSON.stringify({ ...defaults(), history: [null] })]) {
    const f = fixture(source); const store = new Store({ read: async () => (await loadWithLegacy(f.port)).data, write: f.port.writeCurrent });
    await store.load(); assert.equal(store.loadError, 'loadFailed'); await assert.rejects(store.setMinutes(5));
    assert.equal(f.writes(), 0); assert.equal(f.disk(), undefined);
  }
});

test('Legacy import: failed write can retry on reload; partial destination is protected until manually backed up and removed', async () => {
  const source = JSON.stringify(defaults());
  for (const failure of ['before', 'partial', 'after'] as const) {
    const f = fixture(source); f.fail(failure); await assert.rejects(loadWithLegacy(f.port));
    assert.equal(f.writes(), 1); assert.equal(await f.port.adapter.read(f.port.configDir + '/plugins/casual-memory-games/data.json'), source);
    f.fail('none');
    if (failure === 'partial') {
      const store = new Store({ read: async () => (await loadWithLegacy(f.port)).data, write: f.port.writeCurrent });
      await store.load(); assert.equal(store.loadError, 'loadFailed'); assert.equal(f.writes(), 1);
      f.removeBrokenCopy(); // Explicit manual recovery, never done by the importer.
    }
    const recovered = await loadWithLegacy(f.port); assert.deepEqual(recovered.data, JSON.parse(source));
    assert.equal(recovered.imported, failure !== 'after'); assert.equal(f.writes(), failure === 'after' ? 1 : 2);
    await loadWithLegacy(f.port); assert.equal(f.writes(), failure === 'after' ? 1 : 2);
  }
});

test('Legacy import: a destination appearing during source read is kept; failed read and failed read-back do not overwrite again', async () => {
  const old = defaults(); const other = defaults(); other.settings.minutes = 5;
  const f = fixture(JSON.stringify(old)); const read = f.port.adapter.read;
  f.port.adapter.read = async path => { const raw = await read(path); f.appear(other); return raw; };
  const result = await loadWithLegacy(f.port); assert.equal(result.imported, false); assert.deepEqual(result.data, other); assert.equal(f.writes(), 0);
  const unreadable = fixture(JSON.stringify(old)); unreadable.port.adapter.read = async () => { throw new Error('read failure'); };
  await assert.rejects(loadWithLegacy(unreadable.port)); assert.equal(unreadable.writes(), 0);
  const mismatch = fixture(JSON.stringify(old)); mismatch.port.readCurrent = async () => other;
  await assert.rejects(loadWithLegacy(mismatch.port), /round-trip/); assert.equal(mismatch.writes(), 1);
  assert.equal((await loadWithLegacy(mismatch.port)).imported, false); assert.equal(mismatch.writes(), 1);
});

test('Brumalt release metadata, languages and approved cover are consistent', async () => {
  const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  const versions = JSON.parse(await readFile('versions.json', 'utf8'));
  assert.equal(manifest.id, 'brumalt'); assert.equal(manifest.name, 'Brumalt'); assert.equal(manifest.author, 'Zinvernix');
  assert.equal(manifest.version, '0.3.5'); assert.equal(manifest.minAppVersion, '1.13.0'); assert.equal(manifest.isDesktopOnly, false);
  assert.equal(pkg.name, 'brumalt'); assert.equal(pkg.version, manifest.version); assert.equal(pkg.author, 'Zinvernix');
  assert.equal(pkg.license, 'MIT'); assert.equal(lock.version, manifest.version); assert.equal(lock.packages[''].version, manifest.version);
  assert.deepEqual(versions, { '0.3.3': '1.7.2', '0.3.4': '1.13.0', '0.3.5': '1.13.0' });
  const cover = await readFile('assets/walp.jpg');
  assert.equal(cover.readUInt16BE(0), 0xffd8); assert.ok(cover.length > 1000);
  const { createHash } = await import('node:crypto'); assert.equal(createHash('sha256').update(cover).digest('hex'), 'ad668a055d212b32d020ad219206d32b68f4431bc7128d4a29655feee55bc8cd');
});
