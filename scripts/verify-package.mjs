import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
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
const archive = `dist/brumalt-${manifest.version}.zip`;
const files = ['main.js', 'manifest.json', 'styles.css', 'LICENSE'];
const entries = (await exec('unzip', ['-Z1', archive], { encoding: 'utf8' })).stdout.trim().split('\n');
assert.deepEqual(entries.sort(), files.map(file => `brumalt/${file}`).sort());
for (const file of files) {
  const packed = (await exec('unzip', ['-p', archive, `brumalt/${file}`], { encoding: 'buffer' })).stdout;
  assert.deepEqual(packed, await readFile(`dist/brumalt/${file}`));
  assert.deepEqual(packed, await readFile(file));
}
for (const line of (await readFile('dist/SHA256SUMS', 'utf8')).trim().split('\n')) {
  const [expected, path] = line.split('  ');
  assert.equal(createHash('sha256').update(await readFile(`dist/${path}`)).digest('hex'), expected);
}
console.log(`Verified ${manifest.name} ${manifest.version}: versions, four ZIP entries, exact bytes and SHA-256.`);
