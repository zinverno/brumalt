import { build } from 'esbuild';
import { readdir, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await mkdir('.test-build', { recursive: true });
const files = (await readdir('tests')).filter(f => f.endsWith('.test.ts'));
await build({ entryPoints: files.map(f => `tests/${f}`), outdir: '.test-build',
  outExtension: { '.js': '.cjs' }, bundle: true, platform: 'node', format: 'cjs', target: 'node22',
  packages: 'external', alias: { obsidian: './tests/fixtures/obsidian.ts' } });
let failed = false;
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ['--test-reporter=spec', `.test-build/${file.replace('.ts', '.cjs')}`], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
