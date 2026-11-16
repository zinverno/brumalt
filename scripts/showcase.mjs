// Native capture scenario using Veynrel's isolated launcher and CDP architecture.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, copyFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
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
import { assertNativeRoot, launchObsidian, nativeEndpoint } from './native/session.mjs';
async function prepare(root) {
  execFileSync(process.execPath, ['scripts/verify-package.mjs'], { stdio: 'inherit' });
  assert.equal((await json('dist/brumalt/manifest.json')).version, '0.3.5');
  const vault = join(root, 'Brumalt');
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
    '../../app.json': { showInlineTitle: false, checkForUpdates: false, settingsPopoutWindow: false },
    '../../appearance.json': { theme: 'obsidian', accentColor: '#a78bfa', interfaceFontFamily: 'Noto Sans Condensed' },
  };
  for (const [file, value] of Object.entries(files)) await writeFile(join(installation, file), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  await writeFile(join(vault, 'Brumalt.md'), '# Brumalt\n', { flag: 'wx' });
  await writeFile(join(profile, 'obsidian.json'), JSON.stringify({ updateDisabled: true, vaults: { brumaltshowcase: { path: vault, ts: Date.now(), open: true } } }), { flag: 'wx' });
  await writeFile(join(root, 'showcase.json'), JSON.stringify({ vault, profile, version: '0.3.5', checksums, synthetic: true }, null, 2), { flag: 'wx' });
  return { vault, profile, version: '0.3.5', checksums, history: data.history };
}

async function pack() {
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
}

const pause = ms => new Promise(done => setTimeout(done, ms));
async function capture(root) {
  assertNativeRoot(root);
  const setup = await prepare(root);
  const report = { source: 'Native Obsidian / CDP and X11 window capture', synthetic: true, shots: [], exceptions: [],
    assets: setup.checksums, visualReview: 'required', status: 'FAIL', harnessHashes: {} };
  for (const file of ['scripts/showcase.mjs','scripts/showcase-data.ts','scripts/native/run.py','scripts/native/session.mjs'])
    report.harnessHashes[file] = hash(await readFile(file));
  let child, socket, call, evaluate, endpoint, settingsConnection;
  try {
    assert.equal(await realpath(setup.vault), join(root, 'Brumalt'));
    child = launchObsidian(root);
    endpoint = await nativeEndpoint(root, child);
    let page;
    for (let i = 0; i < 200; i++) {
      const targets = await fetch(`${endpoint}/json/list`, { signal: AbortSignal.timeout(5000) }).then(r => r.json());
      const pages = targets.filter(t => t.type === 'page' && t.url.startsWith('app://obsidian.md'));
      assert(pages.length <= 1, 'Expected one owned Obsidian renderer');
      if (pages.length) { page = pages[0]; break; }
      await pause(100);
    }
    assert(page, 'Obsidian renderer not ready');
    const connect = async target => {
    const address = new URL(target.webSocketDebuggerUrl);
    assert.equal(address.hostname, '127.0.0.1');
    assert.equal(address.port, new URL(endpoint).port);
    const socket = new WebSocket(address);
    await new Promise((done, fail) => {
      const timer = setTimeout(() => fail(Error('Native debugger connection timed out')), 5000);
      socket.onopen = () => { clearTimeout(timer); done(); };
      socket.onerror = () => { clearTimeout(timer); fail(Error('Native debugger connection failed')); };
    });
    let nextId = 0;
    const pending = new Map();
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') report.exceptions.push(message.params.exceptionDetails);
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id); clearTimeout(request.timer);
      if (message.error) request.fail(Error(JSON.stringify(message.error))); else request.done(message.result);
    };
    const call = (method, params = {}) => new Promise((done, fail) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); fail(Error(`CDP timed out: ${method} ${(params.expression ?? "").slice(0,120)}`)); }, 10000);
      pending.set(id, { done, fail, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
      const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result.value;
    };
      return { socket, call, evaluate };
    };
    ({ socket, call, evaluate } = await connect(page));
    const wait = async expression => {
      for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await pause(100); }
      throw Error(`UI readiness timed out: ${expression}`);
    };
    const click = async (label, scope = '.cmg-app') => {
      assert(await evaluate(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(scope + ' button')})]
        .find(e => e.textContent.trim() === ${JSON.stringify(label)} && e.getClientRects().length && !e.disabled);
        if (!b) return false; b.click(); return true; })()`), `Button unavailable: ${label}`);
    };
    await call('Runtime.enable'); await call('Page.enable');
    await call('Network.enable'); await call('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] });
    const ready = async () => {
      await wait('!!window.app?.workspace?.layoutReady');
      // Read the actual vault identity before any UI mutation, including trusting this fixture.
      assert.equal(await evaluate('app.vault.adapter.getBasePath()'), setup.vault);
      await wait("!!app.plugins.plugins.brumalt || !!document.querySelector('.mod-trust-folder')");
      if (await evaluate("!!document.querySelector('.mod-trust-folder')")) await click('Trust author and enable plugins', '.mod-trust-folder');
      await wait("!!app.commands.commands['brumalt:open-games'] && !!app.plugins.plugins.brumalt?.store");
      await evaluate('new Promise(r => app.workspace.onLayoutReady(r))');
      assert.equal(await evaluate('app.plugins.plugins.brumalt.manifest.version'), setup.version);
    };
    await ready();
    report.versions = await evaluate(`({obsidian:app.getVersion?.() ?? document.title.match(/Obsidian ([0-9.]+)/)?.[1], electron:process.versions.electron,
      chrome:process.versions.chrome, plugin:app.plugins.plugins.brumalt.manifest.version})`);
    for (const language of ['en', 'ru']) {
      // This is Obsidian's persisted locale preference, confined to the fresh profile.
      if (await evaluate('localStorage.getItem("language")') !== language) {
        await evaluate(`localStorage.setItem('language', '${language}')`);
        await call('Page.reload'); await pause(500); await ready();
      }
      assert.equal(await evaluate("document.documentElement.lang"), language);
      await evaluate(`app.setting.open();app.setting.openTabById('brumalt');void 0`);
      await wait("!!app.setting.activeTab?.containerEl.querySelector('select')");
      assert(await evaluate(`(() => { const s = [...app.setting.activeTab.containerEl.querySelectorAll('select')]
        .find(e => [...e.options].some(o => o.value === 'ru'));
        if (!s) return false; s.value = '${language}'; s.dispatchEvent(new Event('change', {bubbles:true})); return true; })()`));
      await wait(`app.plugins.plugins.brumalt.language === '${language}' && !app.plugins.plugins.brumalt.store.configurationBusy`);
      await evaluate(`app.setting.close();app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();void 0`);
      // A neutral bilingual filename keeps the blurred background free of personal information.
      await evaluate(`app.workspace.getLeaf(false).openFile(app.vault.getFileByPath('Brumalt.md'), {state:{mode:'preview'}})`);
      await call('Page.bringToFront'); await evaluate('window.electronWindow.focus();void 0');
      await wait('document.hasFocus() && !document.hidden');
      for (const [shot, expected] of Object.entries(shots).filter(([name]) => name.startsWith(language + '/'))) {
        const width = language === 'en' ? 1200 : 1600;
        const height = language === 'en' ? 800 : expected[0] === 'Settings' ? 1100 : 900;
        const zoom = language === 'en' ? 0.9 : 1;
        await evaluate(`electron.webFrame.setZoomFactor(${zoom});void 0`);
        await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        await wait(`Math.abs(innerWidth * ${zoom} - ${width}) <= 1 && Math.abs(innerHeight * ${zoom} - ${height}) <= 1`);
        if (expected[0] === 'Settings') {
          await evaluate("app.plugins.plugins.brumalt.gameModal.close();app.vault.setConfig('settingsPopoutWindow',true);app.setting.open();app.setting.openTabById('brumalt');void 0");
          await wait("!!app.setting.activeTab?.containerEl.querySelector('select')");
        } else {
          if (!await evaluate('!!app.plugins.plugins.brumalt.gameModal')) {
            assert(await evaluate("app.commands.executeCommandById('brumalt:open-games')"));
          }
          await wait("app.plugins.plugins.brumalt.gameModal?.screen === 'Home'");
          if (expected[0] === 'Progress') await click(language === 'en' ? 'Progress' : 'Прогресс');
          if (expected[0] === 'GameActive') {
            await evaluate(`document.querySelector('.cmg-card[data-game="${expected[1]}"]').click();void 0`);
            await wait("app.plugins.plugins.brumalt.gameModal?.screen === 'GameSetup'");
            await click(language === 'en' ? 'Start' : 'Начать');
          }
        }
        await wait(expected[0] === 'Settings' ? "!!app.setting.activeTab?.containerEl.isConnected" : `app.plugins.plugins.brumalt.gameModal?.screen === '${expected[0]}'`);
        let shotCall = call, nativeWindow;
        if (expected[0] === 'Settings' && await evaluate('app.setting.modalEl.ownerDocument !== document')) {
          const title = await evaluate('app.setting.modalEl.ownerDocument.title');
          const targets = await fetch(`${endpoint}/json/list`).then(r => r.json());
          const settingsPages = targets.filter(t => t.type === 'page' && t.id !== page.id && t.title === title);
          assert.equal(settingsPages.length, 1, 'Identify only the owned settings document');
          settingsConnection = await connect(settingsPages[0]);
          shotCall = settingsConnection.call;
          await shotCall('Emulation.clearDeviceMetricsOverride');
          nativeWindow = await evaluate('app.setting.popout.win.electronWindow.getNativeWindowHandle().readUInt32LE(0)');
          assert(Number.isSafeInteger(nativeWindow) && nativeWindow > 0);
          const extents = execFileSync('xprop', ['-id', String(nativeWindow), '_NET_FRAME_EXTENTS'], {encoding:'utf8'}).match(/= (\d+), (\d+), (\d+), (\d+)/);
          assert(extents, 'Native frame extents required');
          const [left,right,top,bottom] = extents.slice(1).map(Number);
          await evaluate(`app.setting.popout.win.electronWindow.setContentSize(${width-left-right},${height-top-bottom});app.setting.popout.win.electronWindow.setPosition(80,40);void 0`);
          await shotCall('Page.bringToFront');
          assert.equal(await settingsConnection.evaluate('document.querySelector(".vertical-tab-content").lang'), language);
        }
        await (nativeWindow ? settingsConnection.evaluate : evaluate)('document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))');
        await pause(200);
        const state = await evaluate(`(() => { const p = app.plugins.plugins.brumalt, m = p.gameModal;
          const visible = e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
          const area = m ? document.querySelector('.cmg-app') : app.setting.activeTab.containerEl;
          const doc = area.ownerDocument;
          const modal = area.closest('.modal'), bounds = modal.getBoundingClientRect();
          return {screen: m?.screen ?? 'Settings', game:m?.attempt?.challenge.game, phase:m?.attempt?.phase,
            language:p.language, hostLanguage:document.documentElement.lang, dark:doc.body.classList.contains('theme-dark'),
            notices:[...doc.querySelectorAll('.notice')].filter(visible).length,
            closes:[...doc.querySelectorAll('.modal-close-button, .modal > .modal-header-button')].filter(visible).length,
            text:area.innerText, cards:area.querySelectorAll('.cmg-card').length,
            radarScores:[...area.querySelectorAll('.cmg-radar-point')].map(e=>Number(e.dataset.score)),
            horizontalOverflow:area.scrollWidth-area.clientWidth, verticalOverflow:modal.scrollHeight-modal.clientHeight,
            font:getComputedStyle(area).fontFamily, zoom:electron.webFrame.getZoomFactor(),
            bounds:{x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height}}; })()`);
        assert.equal(state.screen, expected[0]); assert.equal(state.language, language); assert.equal(state.hostLanguage, language);
        if (expected[1]) { assert.equal(state.game, expected[1]); assert.equal(state.phase, expected[2]); }
        assert(state.dark); assert.equal(state.notices, 0); assert.equal(state.closes, nativeWindow ? 0 : 1);
        assert(state.horizontalOverflow <= 1); assert(state.verticalOverflow <= 1);
        assert(state.bounds.x >= 0 && state.bounds.y >= 0 && state.bounds.x + state.bounds.width <= width / zoom + 1 && state.bounds.y + state.bounds.height <= height / zoom + 1);
        if (expected[0] === 'Home') { assert.equal(state.cards, 6); assert.match(state.text, /4 \/ 6/); }
        if (expected[0] === 'Progress') { assert.equal(state.radarScores.length, 6); assert(state.radarScores.every(n=>n>0 && n<100)); }
        assert(!/New Life|zinvernix|@|sk-[A-Za-z0-9]/i.test(state.text), 'Unexpected private text');
        for (const type of ['mousePressed', 'mouseReleased']) await shotCall('Input.dispatchMouseEvent', {type, x:state.bounds.x+state.bounds.width/2, y:state.bounds.y+15, button:'left', clickCount:1});
        await shotCall('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 12, y: height - 12 });
        // CDP omits OS decorations; X11 retains the actual settings window's sole close control.
        const png = nativeWindow
          ? execFileSync('import', ['-window', String(nativeWindow), '-frame', 'png:-'], {maxBuffer:5*1024*1024})
          : Buffer.from((await shotCall('Page.captureScreenshot', { format:'png', fromSurface:true, captureBeyondViewport:false })).data, 'base64');
        if (expected[2]) assert.equal(await evaluate('app.plugins.plugins.brumalt.gameModal?.attempt?.phase'), expected[2]);
        assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
        assert.equal(png.readUInt32BE(16), width); assert.equal(png.readUInt32BE(20), height); assert(png.length < 5 * 1024 * 1024);
        await writeFile(join(root, 'captures', `${shot}.png`), png, { flag: 'wx' });
        report.shots.push({ method:nativeWindow ? 'X11 window capture including native frame' : 'Page.captureScreenshot', file:`${shot}.png`, width, height, bytes:png.length, sha256:hash(png), state, visualReview:'required', capturedAt:new Date().toISOString() });
        console.log(`Captured ${shot}.png (${width} × ${height})`);
        if (expected[0] === 'GameActive' || expected[0] === 'Progress') {
          await click(language === 'en' ? 'Back' : 'Назад');
          if (expected[0] === 'GameActive') {
            const label = await evaluate("app.plugins.plugins.brumalt.tr('cancelReturn')");
            await click(label, '.cmg-exit-panel');
          }
          await wait("app.plugins.plugins.brumalt.gameModal?.screen === 'Home'");
        }
      }
      await evaluate('app.plugins.plugins.brumalt.gameModal?.close();app.setting.close();void 0');
    }
    assert.equal(report.shots.length, 8); assert.equal(report.exceptions.length, 0);
    assert.deepEqual((await json(join(setup.vault, '.obsidian/plugins/brumalt/data.json'))).history, setup.history);
    for (const [file, checksum] of Object.entries(setup.checksums)) assert.equal(hash(await readFile(join(setup.vault, '.obsidian/plugins/brumalt', file))), checksum);
    report.status = 'CAPTURED';
  } catch (error) {
    report.error = String(error.stack ?? error); process.exitCode = 1;
    if (call) {
      try {
        report.failureText = await evaluate('document.body.innerText');
        report.targets = await fetch(`${endpoint}/json/list`).then(r=>r.json());
        await writeFile(join(root, 'failure.png'), Buffer.from((await (settingsConnection?.call ?? call)('Page.captureScreenshot', {format:'png'})).data, 'base64'));
      } catch (captureError) { report.captureError = String(captureError); }
    }
  } finally {
    settingsConnection?.socket.close(); socket?.close();
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise(done => child.once('exit', done)); child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 3000); await exited; clearTimeout(timer);
    }
    await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({root, status:report.status, shots:report.shots.length, error:report.error}));
  }
}
const [command, directory] = process.argv.slice(2);
if (command === 'capture') await capture(directory);
else if (command === 'pack' && !directory) await pack();
else throw Error('Use npm run showcase:capture, or node scripts/showcase.mjs pack');
