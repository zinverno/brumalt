import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { createHash } from 'node:crypto';
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const manifest = await json('manifest.json');
const pkg = await json('package.json');
const lock = await json('package-lock.json');
const versions = await json('versions.json');
assert.equal(manifest.id, 'brumalt'); assert.equal(manifest.name, 'Brumalt'); assert.equal(manifest.author, 'Zinvernix');
assert.equal(pkg.name, manifest.id); assert.equal(pkg.version, manifest.version);
assert.equal(lock.name, pkg.name); assert.equal(lock.version, pkg.version); assert.equal(lock.packages[''].version, pkg.version);
assert.equal(versions[manifest.version], manifest.minAppVersion);
const base = process.argv[2] ?? 'dist';
const archive = `${base}/brumalt-${manifest.version}.zip`;
const files = ['main.js', 'manifest.json', 'styles.css', 'LICENSE'];
const packedFiles = unzipSync(new Uint8Array(await readFile(archive)));
const entries = Object.keys(packedFiles);
assert.deepEqual(entries.sort(), files.map(file => `brumalt/${file}`).sort());
for (const file of files) {
  const packed = Buffer.from(packedFiles[`brumalt/${file}`]);
  assert.deepEqual(packed, await readFile(`dist/brumalt/${file}`));
  assert.deepEqual(packed, await readFile(file));
  if (base !== 'dist' && file !== 'LICENSE') assert.deepEqual(packed, await readFile(`${base}/${file}`));
}
const checksumLines = (await readFile(`${base}/SHA256SUMS`, 'utf8')).trim().split('\n');
assert.deepEqual(checksumLines.map(line => line.split('  ')[1]).sort(), [...files.map(file => `brumalt/${file}`), `brumalt-${manifest.version}.zip`].sort());
for (const line of checksumLines) {
  const [expected, path] = line.split('  ');
  assert.equal(createHash('sha256').update(path.startsWith('brumalt/') ? packedFiles[path] : await readFile(`${base}/${path}`)).digest('hex'), expected);
}
console.log(`Verified ${manifest.name} ${manifest.version}: versions, four ZIP entries, exact bytes and SHA-256.`);
