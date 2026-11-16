// Run from the checkout root. Captures a real, separately launched Obsidian only.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';

const shots = {
  'en/01-home': ['Home'], 'en/02-logic': ['GameActive', 'rule', 'answer'], 'en/03-progress': ['Progress'],
  'ru/01-home': ['Home'], 'ru/02-memory': ['GameActive', 'location', 'show'],
  'ru/03-logic': ['GameActive', 'rule', 'answer'], 'ru/04-progress': ['Progress'], 'ru/05-settings': ['Settings'],
};
const hash = data => createHash('sha256').update(data).digest('hex');
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const [command, directory, shot] = process.argv.slice(2);
if (command === 'prepare') {
  assert(!directory, 'prepare always creates a fresh temporary directory');
  execFileSync(process.execPath, ['scripts/verify-package.mjs'], { stdio: 'inherit' });
  assert.equal((await json('dist/brumalt/manifest.json')).version, '0.3.5');
  const root = await mkdtemp(join(tmpdir(), 'brumalt-showcase-'));
  const vault = join(root, 'Brumalt Showcase');
  const profile = join(root, 'profile');
  const installation = join(vault, '.obsidian/plugins/brumalt');
  for (const dir of [installation, profile, join(root, 'config'), join(root, 'captures/en'), join(root, 'captures/ru')]) await mkdir(dir, { recursive: true });
  const checksums = {};
  for (const file of ['main.js', 'manifest.json', 'styles.css', 'LICENSE']) {
    await copyFile(`dist/brumalt/${file}`, join(installation, file));
    checksums[file] = hash(await readFile(join(installation, file)));
  }
  const compiled = await build({ entryPoints: ['scripts/showcase-data.ts'], bundle: true, write: false,
    platform: 'node', format: 'esm', target: 'node22' });
  const { showcaseData } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);
  const data = await showcaseData();
  const files = {
    'data.json': data,
    '../../community-plugins.json': ['brumalt'],
    '../../core-plugins.json': ['file-explorer', 'command-palette'],
    '../../app.json': { showInlineTitle: true },
    '../../appearance.json': { theme: 'obsidian', accentColor: '#a78bfa' },
  };
  for (const [file, value] of Object.entries(files)) await writeFile(join(installation, file), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  await writeFile(join(vault, 'Welcome to Brumalt.md'), '# Welcome to Brumalt\n\nA quiet space for a short pause.\n\nThis demonstration contains fictional practice results only.\n', { flag: 'wx' });
  await writeFile(join(profile, 'obsidian.json'), JSON.stringify({ vaults: { brumaltshowcase: { path: vault, ts: Date.now(), open: true } } }), { flag: 'wx' });
  await writeFile(join(root, 'showcase.json'), JSON.stringify({ vault, profile, version: '0.3.5', port: 9259, checksums, synthetic: true }, null, 2), { flag: 'wx' });
  console.log(`Prepared 62 synthetic, validated completions; today: 4/6 points.\n${root}`);
} else if (command === 'capture') {
  assert(directory && Object.hasOwn(shots, shot), 'Usage: node scripts/showcase.mjs capture <temporary-root> <en/01-home|...>');
  const root = await realpath(directory);
  const setup = await json(join(root, 'showcase.json'));
  assert.equal(await realpath(setup.vault), join(root, 'Brumalt Showcase'));
  assert.equal(await realpath(setup.profile), join(root, 'profile'));
  assert.equal(setup.port, 9259);
  assert.equal(setup.version, '0.3.5');
  for (const [file, checksum] of Object.entries(setup.checksums)) {
    assert(['main.js', 'manifest.json', 'styles.css', 'LICENSE'].includes(file));
    assert.equal(hash(await readFile(join(setup.vault, '.obsidian/plugins/brumalt', file))), checksum);
  }
  const targets = await fetch(`http://127.0.0.1:${setup.port}/json/list`, { signal: AbortSignal.timeout(5000) }).then(r => r.json());
  const pages = targets.filter(target => target.type === 'page' && target.url.startsWith('app://obsidian.md'));
  assert.equal(pages.length, 1, 'Expected exactly one native Obsidian page');
  const endpoint = new URL(pages[0].webSocketDebuggerUrl);
  assert(['127.0.0.1', 'localhost'].includes(endpoint.hostname));
  const socket = new WebSocket(endpoint);
  await new Promise((done, fail) => {
    const timer = setTimeout(() => { socket.close(); fail(new Error('Native debugger connection timed out')); }, 5000);
    socket.onopen = () => { clearTimeout(timer); done(); };
    socket.onerror = () => { clearTimeout(timer); fail(new Error('Native debugger connection failed')); };
  });
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id); clearTimeout(request.timer);
    if (message.error) request.fail(new Error(JSON.stringify(message.error))); else request.done(message.result);
  };
  const call = (method, params = {}) => new Promise((done, fail) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); fail(new Error(`CDP timed out: ${method}`)); }, 5000);
    pending.set(id, { done, fail, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true });
    assert(!result.exceptionDetails, 'Native UI query failed'); return result.result.value;
  };
  try {
    // Refuse another vault before focusing, resizing, clicking, or capturing anything.
    assert.equal(await evaluate('app.vault.adapter.getBasePath()'), setup.vault);
    assert.equal(await evaluate('app.plugins.plugins.brumalt.manifest.version'), setup.version);
    const language = shot.split('/')[0];
    assert.equal(await evaluate('app.plugins.plugins.brumalt.language'), language, 'Choose the language in Brumalt settings first');
    const width = language === 'en' ? 1200 : 1600;
    const height = language === 'en' ? 800 : shot === 'ru/05-settings' ? 1100 : 900;
    const { windowId } = await call('Browser.getWindowForTarget');
    await call('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
    await call('Browser.setWindowBounds', { windowId, bounds: { width, height } });
    await call('Page.bringToFront');
    await new Promise(done => setTimeout(done, 350));
    const size = await evaluate('({w:innerWidth,h:innerHeight})');
    if (size.w !== width || size.h !== height) {
      await call('Browser.setWindowBounds', { windowId, bounds: { width: width * 2 - size.w, height: height * 2 - size.h } });
      await new Promise(done => setTimeout(done, 350));
    }
    assert.deepEqual(await evaluate('({w:innerWidth,h:innerHeight})'), { w: width, h: height }, 'Resize the desktop; do not stretch the screenshot');
    const expected = shots[shot];
    if (expected[0] === 'GameActive') {
      assert(await evaluate('document.hasFocus() && !document.hidden'), 'Focus the isolated Obsidian window first');
      assert.equal(await evaluate('app.plugins.plugins.brumalt.gameModal?.screen'), 'GameSetup', 'Leave the chosen game on setup; the script clicks its real Start button');
      const start = language === 'en' ? 'Start' : 'Начать';
      assert(await evaluate(`(() => { const button = [...document.querySelectorAll('.cmg-app button')].find(el => el.textContent === ${JSON.stringify(start)}); if (!button || button.disabled) return false; button.click(); return true; })()`));
      await new Promise(done => setTimeout(done, 120));
    }
    const state = await evaluate(`(() => { const p = app.plugins.plugins.brumalt, m = p.gameModal;
      const visible = el => el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden';
      return {screen: m?.screen ?? (document.querySelector('.mod-settings') ? 'Settings' : null),
        game: m?.attempt?.challenge.game, phase: m?.attempt?.phase,
        dark: document.body.classList.contains('theme-dark'),
        notices: [...document.querySelectorAll('.notice')].filter(visible).length,
        closes: [...document.querySelectorAll('.modal-close-button')].filter(visible).length}; })()`);
    assert.equal(state.screen, expected[0]);
    if (expected[1]) { assert.equal(state.game, expected[1]); assert.equal(state.phase, expected[2]); }
    assert(state.dark); assert.equal(state.notices, 0); assert.equal(state.closes, 1);
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 12, y: height - 12 });
    const screenshot = await call('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    if (expected[2]) assert.equal(await evaluate('app.plugins.plugins.brumalt.gameModal?.attempt?.phase'), expected[2], 'Task changed during capture; retake without altering its timer');
    const png = Buffer.from(screenshot.data, 'base64');
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), width); assert.equal(png.readUInt32BE(20), height);
    assert(png.length < 5 * 1024 * 1024);
    const file = resolve(root, 'captures', `${shot}.png`);
    await mkdir(join(root, 'captures', language), { recursive: true });
    await writeFile(file, png, { flag: 'wx' });
    await writeFile(`${file}.json`, JSON.stringify({ source: 'native Obsidian via CDP', version: setup.version,
      userAgent: await evaluate('navigator.userAgent'), width, height, bytes: png.length,
      sha256: hash(png), state, synthetic: true, visualReview: 'required', capturedAt: new Date().toISOString() }, null, 2), { flag: 'wx' });
    console.log(`Review the actual image before copying it to assets: ${file}`);
  } finally { socket.close(); }
} else if (command === 'pack') {
  assert(!directory, 'pack reads only the reviewed Russian assets');
  const { zipSync, unzipSync } = await import('fflate');
  const entries = {};
  for (const file of ['01-home.png', '02-memory.png', '03-logic.png', '04-progress.png', '05-settings.png', 'README.md']) {
    const bytes = await readFile(`assets/screenshots/ru/${file}`);
    if (file.endsWith('.png')) {
      assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert.equal(bytes.readUInt32BE(16), 1600);
      assert.equal(bytes.readUInt32BE(20), file === '05-settings.png' ? 1100 : 900);
      assert(bytes.length < 5 * 1024 * 1024);
    }
    entries[file] = new Uint8Array(bytes);
  }
  const zip = zipSync(entries, { level: 9, mtime: new Date(2000, 0, 1), os: 0 });
  assert.deepEqual(unzipSync(zip), entries);
  await mkdir('dist', { recursive: true });
  await writeFile('dist/brumalt-habr-screenshots.zip', zip, { flag: 'wx' });
  console.log(`dist/brumalt-habr-screenshots.zip · ${zip.length} bytes · SHA-256 ${hash(zip)}`);
} else {
  throw new Error('Use prepare, capture <temporary-root> <language/shot-name>, or pack');
}
