import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseData, defaults, Store } from '../src/core/storage';

const exec = promisify(execFile);
test('JSON boundary: malformed nested arrays and duplicate/order keys fail closed across old schemas', async () => {
  for (const version of [1, 2, 3, 4]) {
    const raw = version === 4 ? defaults() : JSON.parse(await readFile(`tests/fixtures/data-v${version}.json`, 'utf8'));
    assert.equal(parseData(raw).schemaVersion, 4);
    const changes = [
      (d: any) => { d.history = [null]; },
      (d: any) => { d.history = [42]; },
      (d: any) => { d.history = [{ id: 'incomplete' }]; },
      (d: any) => { d.adaptive.numbers.recent = [{}]; },
      (d: any) => { d.settings.enabled = ['numbers', null]; },
      (d: any) => { d.settings.practice.numbers = []; },
    ];
    if (version >= 3) changes.push(
      d => { d.daily.days = [null]; }, d => { d.daily.schedule = [null]; },
      d => { d.daily.schedule = [{ from: '2026-01-02', goal: 6 }, { from: '2026-01-01', goal: 6 }]; },
      d => { d.daily.schedule = [d.daily.schedule[0], d.daily.schedule[0]]; },
    );
    for (const change of changes) {
      const broken = structuredClone(raw); change(broken);
      assert.throws(() => parseData(broken)); let writes = 0;
      const store = new Store({ read: async () => broken, write: async () => { writes++; } });
      await store.load(); assert.equal(store.loadError, 'loadFailed');
      await assert.rejects(store.setMinutes(5)); assert.equal(writes, 0);
    }
  }
});

test('Portable ZIP: no zip/unzip on PATH, reproducible across time zones, exact files and corrupt checksum rejected', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'brumalt-package-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const file of ['manifest.json', 'package.json', 'package-lock.json', 'versions.json', 'styles.css', 'LICENSE']) await copyFile(file, join(dir, file));
  await writeFile(join(dir, 'main.js'), 'module.exports = {};\n');
  const env = { ...process.env, PATH: '', TZ: 'UTC' };
  const packageScript = resolve('scripts/package.mjs'); const verifyScript = resolve('scripts/verify-package.mjs');
  await assert.rejects(exec('zip', [], { env }), { code: 'ENOENT' });
  await assert.rejects(exec('unzip', [], { env }), { code: 'ENOENT' });
  await exec(process.execPath, [packageScript], { cwd: dir, env });
  const first = await readFile(join(dir, 'dist/brumalt-0.3.4.zip'));
  await exec(process.execPath, [verifyScript], { cwd: dir, env });
  await exec(process.execPath, [packageScript], { cwd: dir, env: { ...env, TZ: 'Pacific/Honolulu' } });
  assert.deepEqual(await readFile(join(dir, 'dist/brumalt-0.3.4.zip')), first);
  await writeFile(join(dir, 'dist/SHA256SUMS'), '0'.repeat(64) + '  brumalt/main.js\n');
  await assert.rejects(exec(process.execPath, [verifyScript], { cwd: dir, env }));
});

test('CSS compliance retains scoped hidden, screen-reader and reduced-motion styles without flagged declarations', async () => {
  const css = await readFile('styles.css', 'utf8');
  assert.doesNotMatch(css, /!important|clip-path\s*:|text-decoration\s*:/);
  assert.match(css, /\.cmg-app\[hidden\]\s*\{\s*display: none/);
  assert.match(css, /\.cmg-sr-only[^}]*clip: rect\(0, 0, 0, 0\)/);
  assert.match(css, /prefers-reduced-motion: reduce[^]*\.cmg-app \.cmg-tile \{ transition: none/);
  assert.match(css, /cmg-duration-unsaved[^}]*border-bottom: 1px dotted/);
});
