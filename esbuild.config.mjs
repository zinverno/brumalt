import { context } from 'esbuild';
const production = process.argv.includes('production');
const build = await context({
  entryPoints: ['src/main.ts'], bundle: true, external: ['obsidian'],
  format: 'cjs', target: 'es2021', outfile: 'main.js',
  sourcemap: production ? false : 'inline', minify: production,
  logLevel: 'info', banner: { js: '/* Brumalt — MIT; generated from src/main.ts */' },
});
if (production) { await build.rebuild(); await build.dispose(); }
else await build.watch();
