import { mkdir, copyFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { zipSync } from 'fflate';
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const versions = JSON.parse(await readFile('versions.json', 'utf8'));
assert.equal(manifest.id, 'brumalt');
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.match(manifest.minAppVersion, /^\d+\.\d+\.\d+$/);
assert.equal(manifest.isDesktopOnly, false);
assert.equal(pkg.version, manifest.version);
assert.equal(versions[manifest.version], manifest.minAppVersion);
const dir = `dist/${manifest.id}`;
await mkdir(dir, { recursive: true });
for (const file of ['main.js', 'manifest.json', 'styles.css', 'LICENSE']) await copyFile(file, `${dir}/${file}`);
console.log(`Install files: ${dir}`);
// A reproducible archive: fixed timestamps, no extra outer directory or OS metadata.
const { readdir, writeFile } = await import('node:fs/promises');
const { createHash } = await import('node:crypto');
const files = ['main.js', 'manifest.json', 'styles.css', 'LICENSE'];
assert.deepEqual((await readdir(dir)).sort(), [...files].sort());
const entries = {};
for (const file of files) entries[`${manifest.id}/${file}`] = new Uint8Array(await readFile(`${dir}/${file}`));
const archive = `${manifest.id}-${manifest.version}.zip`;
await writeFile(`dist/${archive}`, zipSync(entries, { level: 9, mtime: new Date(2000, 0, 1), os: 0 }));
const checksums = [];
for (const file of [...files.map(file => `${manifest.id}/${file}`), archive]) {
  const content = await readFile(`dist/${file}`);
  checksums.push(`${createHash('sha256').update(content).digest('hex')}  ${file}`);
}
await writeFile('dist/SHA256SUMS', checksums.join('\n') + '\n');
console.log(`ZIP: dist/${archive}`);
