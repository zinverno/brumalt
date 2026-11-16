import { test, type TestContext } from 'node:test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Brumalt from '../src/main';
import { VIEW_TYPE } from '../src/ui/view';
import { GAME_IDS, type SavedData, type AttemptRecord } from '../src/core/types';
import { t as translate, gameText } from '../src/i18n';
import { tileName } from '../src/ui/game-ui';
import { Modal, noticeFragments, notices, setHostLanguage } from './fixtures/obsidian';

const { JSDOM } = createRequire(process.cwd() + '/package.json')('jsdom');
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); };
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

async function fixture(t: TestContext, legacy?: string) {
  notices.length = 0; noticeFragments.length = 0; setHostLanguage('ru');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'https://test.invalid/' });
  const win = dom.window as Window & typeof globalThis;
  const oldDocument = globalThis.document;
  Object.defineProperty(globalThis, 'document', { value: win.document, configurable: true });
  const proto = win.HTMLElement.prototype;
  proto.empty = function () { this.replaceChildren(); };
  proto.setText = function (value) { this.replaceChildren(value); };
  proto.addClass = function (...names) { this.classList.add(...names); };
  proto.removeClass = function (...names) { this.classList.remove(...names); };
  proto.createEl = function (this: HTMLElement, tag: string, options: any = {}) {
    const el = this.ownerDocument.createElement(tag);
    if (options.text) el.textContent = options.text;
    if (options.cls) el.className = options.cls;
    if (options.type) el.setAttribute('type', options.type);
    for (const [key, value] of Object.entries(options.attr ?? {})) el.setAttribute(key, String(value));
    this.appendChild(el); return el;
  } as typeof proto.createEl;
  proto.createDiv = function (options: any) { return this.createEl('div', options); };
  proto.createSpan = function (options: any) { return this.createEl('span', options); };
  proto.getBoundingClientRect = () => ({ width: 600, height: 800, top: 0, left: 0, right: 600, bottom: 800, x: 0, y: 0, toJSON() {} });
  let clock = 0; let serial = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  win.setTimeout = ((fn: () => void, delay = 0) => { const id = ++serial; timers.set(id, { at: clock + delay, fn }); return id; }) as typeof win.setTimeout;
  win.clearTimeout = ((id: number) => { timers.delete(id); }) as typeof win.clearTimeout;
  t.mock.method(performance, 'now', () => clock);
  const events = new Map<string, Set<() => void>>();
  const app: any = { disk: null, writes: 0, failSave: false, commands: new Map(), vault: { configDir: '.obsidian' } };
  const workspace: any = {
    factories: new Map(), leaves: [] as any[], active: null,
    on(name: string, callback: () => void) {
      if (!events.has(name)) events.set(name, new Set());
      events.get(name)!.add(callback); return { remove: () => events.get(name)!.delete(callback) };
    },
    getActiveViewOfType(cls: any) { return this.active?.view instanceof cls ? this.active.view : null; },
    getLeavesOfType(type: string) { return this.leaves.filter((leaf: any) => leaf.type === type); },
    getLeaf() {
      const leaf: any = { app, type: '', view: null,
        async setViewState({ type }: { type: string }) {
          this.type = type; this.view = workspace.factories.get(type)(this); workspace.active = this; await this.view.onOpen();
        },
        async detach() { await this.view?.onClose(); this.view?.unload(); workspace.leaves = workspace.leaves.filter((l: any) => l !== this); },
      };
      this.leaves.push(leaf); return leaf;
    },
    async revealLeaf(leaf: any) { this.active = leaf; events.get('active-leaf-change')?.forEach(fn => fn()); },
  };
  app.workspace = workspace;
  app.legacy = legacy;
  app.vault.adapter = {
    exists: async (path: string) => path === `${app.vault.configDir}/plugins/brumalt/data.json` ? app.disk !== null : path === `${app.vault.configDir}/plugins/casual-memory-games/data.json` && app.legacy !== undefined,
    read: async (path: string) => { if (path.endsWith('/casual-memory-games/data.json') && app.legacy !== undefined) return app.legacy; throw new Error('missing file'); },
  };
  const plugin = new Brumalt(app, { id: 'brumalt' } as never);
  await plugin.onload(); await plugin.openGames();
  const root = () => win.document.querySelector<HTMLElement>('.cmg-app:not([hidden])')!;
  const click = (label: string) => {
    const b = [...root().querySelectorAll('button')].find(b => b.textContent === label);
    assert.ok(b, `Button ${label} exists`); assert.equal(b.disabled, false, `Button ${label} is enabled`); b.click();
  };
  const tick = (ms: number) => {
    const end = clock + ms;
    while (true) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      clock = next[1].at; timers.delete(next[0]); next[1].fn();
    }
    clock = end;
  };
  const choose = (game: string) => {
    const b = [...root().querySelectorAll<HTMLButtonElement>('.cmg-card')].find(b => b.querySelector('strong')?.textContent === game);
    assert.ok(b); b.click();
  };
  t.after(async () => {
    plugin.onunload();
    for (const leaf of [...workspace.leaves]) await leaf.detach();
    dom.window.close(); Object.defineProperty(globalThis, 'document', { value: oldDocument, configurable: true });
  });
  return { win, app, workspace, plugin,
    // The plugin's once-at-midnight calendar timer is separate from game resources.
    get timers() { return new Map([...timers].filter(([id]) => id !== (plugin as any).dayTimer)); },
    allTimers: timers, root, click, tick, choose, events };
}

test('Регрессия: запуск использует выбранную длительность даже до завершения фоновой записи', async t => {
  const f = await fixture(t); const gate = deferred(); f.app.saveGate = gate.promise;
  t.after(() => gate.resolve());
  const play = [...f.root().querySelectorAll('button')].find(b => b.textContent === 'Играть')!;
  const five = [...f.root().querySelectorAll('button')].find(b => b.textContent === '5 мин')!;
  five.click(); five.click(); assert.equal(play.disabled, false);
  assert.match(f.root().textContent!, /около 5 мин/); play.click();
  const session = (f.plugin.gameModal as any).session;
  assert.equal(session.minutes, 5); assert.equal(session.attemptsPerBlock, 5);
  assert.equal(f.plugin.store.data.settings.minutes, 3);
  f.click('Начать'); assert.equal(f.plugin.gameModal!.screen, 'GameActive');
  gate.resolve(); await settle(); assert.equal(f.app.saveAttempts, 1);
  assert.equal(f.plugin.store.data.settings.minutes, 5);
  play.click(); assert.equal((f.plugin.gameModal as any).session, session, 'Старое событие не перезапускает сессию');
});

test('Регрессия: поздняя ошибка записи после закрытия видна и доступна для повтора', async t => {
  const f = await fixture(t); t.mock.method(Math, 'random', () => 0);
  f.choose('Числа'); f.click('Начать'); f.tick(8000);
  const gate = deferred(); f.app.saveGate = gate.promise; t.after(() => gate.resolve());
  const input = f.root().querySelector('input')!;
  input.value = '0000'; input.dispatchEvent(new f.win.Event('input')); f.click('Готово');
  await settle(); f.plugin.gameModal!.close();
  f.app.failSave = true; gate.resolve(); await settle();
  assert.ok(notices.some(message => /не удалось|не записан|не сохран/i.test(message)), 'Нужен Notice после закрытия');
  await f.plugin.openGames();
  assert.match(f.root().textContent!, /Повторить сохранение/);
  const pendingRecord = [...f.plugin.pendingResults.values()][0]!.record;
  const retry = [...f.root().querySelectorAll('button')].find(b => b.textContent === 'Повторить сохранение')!;
  f.app.failSave = false; retry.click(); retry.click(); await settle();
  await f.plugin.saveResult(pendingRecord);
  assert.equal(f.plugin.store.data.history.length, 1);
  assert.deepEqual(f.plugin.store.data.adaptive.numbers.recent, [1]);
  assert.equal(f.plugin.store.data.daily.days[0]!.points, 2);
  assert.equal(f.plugin.store.data.daily.days[0]!.count, 1);
  assert.equal(f.app.saveAttempts, 2); assert.equal(f.plugin.pendingResults.size, 0);
});

test('DOM: optimistic duration survives close/reopen and retries without replacing the Home DOM', async t => {
  const f = await fixture(t); const gate = deferred(); f.app.saveGate = gate.promise;
  t.after(() => gate.resolve()); f.click('5 мин');
  f.plugin.gameModal!.close(); await f.plugin.openGames();
  const hero = f.root().querySelector('.cmg-hero');
  const five = f.root().querySelector<HTMLButtonElement>('.cmg-duration [aria-pressed="true"]')!;
  assert.equal(five.textContent, '5 мин'); assert.doesNotMatch(f.root().textContent!, /Сохраняем/);
  assert.equal([...f.root().querySelectorAll('button')].find(b => b.textContent === 'Играть')!.disabled, false);
  f.app.failSave = true; gate.resolve(); await settle();
  assert.equal(f.plugin.store.data.settings.minutes, 3); assert.equal(f.plugin.minutes, 5);
  assert.equal(f.root().querySelector('.cmg-hero'), hero);
  assert.ok(notices.some(n => n.includes('Не удалось сохранить 5 мин')));
  assert.match(five.title, /Не сохранено/); assert.equal(five.getAttribute('aria-pressed'), 'true');
  f.app.failSave = false; five.click(); five.click(); await settle();
  assert.equal(f.root().querySelector('.cmg-hero'), hero); assert.equal(five.title, '');
  assert.equal(f.app.saveAttempts, 2); f.click('Играть');
  assert.equal((f.plugin.gameModal as any).session.minutes, 5);
});

test('DOM: отложенная успешная запись завершается при закрытой вкладке', async t => {
  const f = await fixture(t); t.mock.method(Math, 'random', () => 0);
  f.choose('Числа'); f.click('Начать'); f.tick(8000);
  const gate = deferred(); f.app.saveGate = gate.promise; t.after(() => gate.resolve());
  const input = f.root().querySelector('input')!; input.value = '0000'; input.dispatchEvent(new f.win.Event('input'));
  f.click('Готово'); await settle(); f.plugin.gameModal!.close();
  assert.equal(f.plugin.pendingResults.size, 1); assert.equal(f.plugin.store.data.history.length, 0);
  gate.resolve(); await settle();
  assert.equal(f.plugin.pendingResults.size, 0); assert.equal(f.plugin.store.data.history.length, 1);
  assert.deepEqual(f.plugin.store.data.adaptive.numbers.recent, [1]);
  assert.equal(f.plugin.store.data.daily.days[0]!.points, 2);
  assert.equal(f.plugin.store.data.daily.days[0]!.count, 1);
  assert.equal(f.app.disk.history.length, 1); assert.equal(f.app.saveAttempts, 1); assert.equal(notices.length, 0);
  await f.plugin.openGames(); f.click('Прогресс');
  assert.match(f.root().textContent!, /Без ошибок: 1 \/ 1/);
});

test('DOM: ошибка настройки следующей сессии не блокирует уже составленный план', async t => {
  const f = await fixture(t); f.click('Играть');
  const planned = (f.plugin.gameModal as any).session;
  f.app.failSave = true; await f.plugin.setMinutes(5);
  assert.equal(f.plugin.durationChange?.status, 'error');
  assert.equal(planned.minutes, 3);
  f.click('Начать');
  assert.equal(f.root().querySelector('[data-phase]')!.getAttribute('data-phase'), ['rule', 'order'].includes(planned.game) ? 'answer' : 'show');
  assert.equal((f.plugin.gameModal as any).session, planned);
});

test('DOM: повторное открытие до поздней ошибки отражает состояние и повторная ошибка не теряет результат', async t => {
  const f = await fixture(t); t.mock.method(Math, 'random', () => 0);
  f.choose('Числа'); f.click('Начать'); f.tick(8000);
  const gate = deferred(); f.app.saveGate = gate.promise; t.after(() => gate.resolve());
  const input = f.root().querySelector('input')!; input.value = '0000'; input.dispatchEvent(new f.win.Event('input'));
  f.click('Готово'); await settle(); f.plugin.gameModal!.close(); await f.plugin.openGames();
  assert.match(f.root().textContent!, /Сохраняем…/);
  assert.equal([...f.root().querySelectorAll('button')].find(b => b.textContent === 'Играть')!.disabled, true);
  f.app.failSave = true; gate.resolve(); await settle();
  f.click('Повторить сохранение'); await settle();
  assert.equal(f.plugin.pendingResults.size, 1); assert.equal(f.plugin.store.data.history.length, 0);
  assert.equal(notices.length, 2);
  f.app.failSave = false; f.click('Повторить сохранение'); await settle();
  assert.equal(f.app.disk.history.length, 1); assert.deepEqual(f.app.disk.adaptive.numbers.recent, [1]);
  assert.equal(f.plugin.pendingResults.size, 0);
});

for (const game of ['Числа', 'Слова', 'Расположение']) {
  test(`DOM: Запомнил скрывает ${game}, старые события не переключают попытку повторно`, async t => {
    const f = await fixture(t); f.choose(game); f.click('Начать');
    const shownDigits = f.root().querySelector('.cmg-digits')?.textContent;
    const shownWords = [...f.root().querySelectorAll('.cmg-word')].map(el => el.textContent);
    const shownObjects = [...f.root().querySelectorAll('.cmg-cell')].map(el => el.querySelector('.cmg-cell-label')?.textContent);
    const timer = [...f.timers.values()].at(-1)!;
    f.tick(1200);
    const ready = [...f.root().querySelectorAll('button')].find(b => b.textContent === 'Запомнил')!;
    ready.click(); ready.click(); timer.fn();
    assert.equal(f.root().querySelector('[data-phase]')?.getAttribute('data-phase'), 'answer');
    assert.equal(f.timers.size, 0); assert.equal(f.root().querySelector('.cmg-digits'), null);
    f.tick(250);
    if (game === 'Числа') {
      const input = f.root().querySelector('input')!; input.value = shownDigits!; input.dispatchEvent(new f.win.Event('input')); f.click('Готово');
    } else if (game === 'Слова') {
      for (const word of shownWords) [...f.root().querySelectorAll<HTMLButtonElement>('.cmg-word')].find(el => el.textContent === word)!.click();
      f.click('Подтвердить');
    } else {
      assert.equal(f.root().querySelectorAll('.cmg-cell .cmg-icon').length, 0);
      const target = f.root().querySelector('.cmg-target')!.textContent!;
      const index = shownObjects.findIndex(label => label && target.includes(`«${label}»`));
      f.root().querySelectorAll<HTMLButtonElement>('.cmg-cell')[index]!.click();
    }
    await settle(); const record = f.plugin.store.data.history[0]!;
    assert.equal(record.displayEnd, 'ready'); assert.equal(record.displayMs, 1200); assert.equal(record.responseMs, 250);
    assert.equal(record.correct, record.total); assert.equal(f.app.saveAttempts, 1);
    f.click('Ещё попытка'); ready.click(); timer.fn();
    assert.equal(f.root().querySelector('[data-phase]')!.getAttribute('data-phase'), 'show');
    assert.equal(f.plugin.store.data.history.length, 1);
  });
}

test('DOM: таймер выигрывает гонку с Запомнил; Последовательность не имеет этой кнопки', async t => {
  const f = await fixture(t); t.mock.method(Math, 'random', () => 0);
  f.choose('Числа'); f.click('Начать');
  const ready = [...f.root().querySelectorAll('button')].find(b => b.textContent === 'Запомнил')!;
  f.tick(8000); ready.click(); f.tick(500);
  const input = f.root().querySelector('input')!; input.value = '0000'; input.dispatchEvent(new f.win.Event('input'));
  f.click('Готово'); await settle();
  assert.equal(f.plugin.store.data.history[0]!.displayEnd, 'timer');
  assert.equal(f.plugin.store.data.history[0]!.displayMs, 8000);
  assert.equal(f.plugin.store.data.history[0]!.responseMs, 500);
  f.click('Закончить'); f.click('Главная'); f.choose('Последовательность'); f.click('Начать');
  assert.ok(![...f.root().querySelectorAll('button')].some(b => b.textContent === 'Запомнил'));
  f.tick(3000); assert.equal(f.root().querySelector('[data-phase]')!.getAttribute('data-phase'), 'show');
  f.tick(50); assert.equal(f.root().querySelector('[data-phase]')!.getAttribute('data-phase'), 'answer');
});

test('DOM: уровень блока ждёт записи, очищает окно и сохраняет ручной уровень свободной игры', async t => {
  const f = await fixture(t); t.mock.method(Math, 'random', () => 0);
  f.plugin.store.data.adaptive.numbers = { level: 2, recent: [0, 0, 0] };
  await f.plugin.store.settings(s => { s.enabled = ['numbers']; s.practice.numbers = { manual: true, level: 5 }; });
  const others = structuredClone(f.plugin.store.data.adaptive.words);
  f.click('Играть'); assert.match(f.root().textContent!, /Уровень 2 · 5 цифр/);
  const oldStart = [...f.root().querySelectorAll('button')].find(b => b.textContent === 'Начать')!;
  const up = [...f.root().querySelectorAll('button')].find(b => b.textContent === 'Посложнее')!;
  const gate = deferred(); f.app.saveGate = gate.promise; t.after(() => gate.resolve());
  up.click(); up.click(); oldStart.click();
  assert.equal(f.root().querySelector('[data-phase]')!.getAttribute('data-phase'), 'preparation');
  assert.equal([...f.root().querySelectorAll('button')].find(b => b.textContent === 'Начать')!.disabled, true);
  assert.equal(f.plugin.store.data.adaptive.numbers.level, 2);
  gate.resolve(); await settle();
  assert.equal(f.app.saveAttempts, 2); // One fixture settings write, one level change.
  assert.deepEqual(f.plugin.store.data.adaptive.numbers, { level: 3, recent: [] });
  assert.deepEqual(f.plugin.store.data.settings.practice.numbers, { manual: true, level: 5 });
  assert.deepEqual(f.plugin.store.data.adaptive.words, others);
  assert.match(f.root().textContent!, /Уровень 3 · 6 цифр/);
  f.click('Начать'); assert.ok(![...f.root().querySelectorAll('button')].some(b => b.textContent === 'Посложнее'));
  f.tick(1000); f.click('Запомнил');
  const input = f.root().querySelector('input')!; input.value = '000000'; input.dispatchEvent(new f.win.Event('input')); f.click('Готово'); await settle();
  assert.equal(f.plugin.store.data.history[0]!.mode, 'session-adaptive');
  assert.equal(f.plugin.store.data.history[0]!.level, 3);
  assert.deepEqual(f.plugin.store.data.adaptive.numbers, { level: 3, recent: [1] });
});

test('DOM: ошибка выбора уровня сохраняет старое окно, повтор и закрытие вкладки работают', async t => {
  const f = await fixture(t);
  f.plugin.store.data.adaptive.numbers = { level: 2, recent: [1, 1, 1] };
  await f.plugin.store.settings(s => { s.enabled = ['numbers']; });
  f.click('Играть'); f.app.failSave = true; f.click('Посложнее'); await settle();
  assert.match(f.root().textContent!, /Не удалось сохранить уровень/);
  assert.deepEqual(f.plugin.store.data.adaptive.numbers, { level: 2, recent: [1, 1, 1] });
  const gate = deferred(); f.app.saveGate = gate.promise; t.after(() => gate.resolve());
  f.app.failSave = false; f.click('Посложнее');
  f.plugin.gameModal!.close(); await f.plugin.openGames();
  assert.equal([...f.root().querySelectorAll('button')].find(b => b.textContent === 'Играть')!.disabled, true);
  gate.resolve(); await settle();
  f.click('Играть'); assert.match(f.root().textContent!, /Уровень 3 · 6 цифр/);
  assert.deepEqual(f.plugin.store.data.adaptive.numbers, { level: 3, recent: [] });
});

test('DOM: числа клавиатурой и экранными кнопками, защита от двойного подтверждения', async t => {
  const f = await fixture(t);
  t.mock.method(Math, 'random', () => 0);
  f.choose('Числа'); f.click('Начать');
  assert.equal(f.root().querySelector('.cmg-digits')?.textContent, '0000');
  assert.equal(f.root().querySelector('input'), null);
  f.tick(8000);
  const input = f.root().querySelector('input')!;
  assert.equal(f.win.document.activeElement, input);
  const confirm = [...f.root().querySelectorAll('button')].find(b => b.textContent === 'Готово')!;
  assert.ok(confirm.disabled);
  f.click('0'); f.click('0'); f.click('⌫'); assert.equal(input.value, '0');
  input.value = '0000'; input.dispatchEvent(new f.win.Event('input', { bubbles: true }));
  input.dispatchEvent(new f.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  confirm.click(); await settle();
  assert.equal(f.plugin.store.data.history.length, 1); assert.equal(f.app.writes, 1);
  assert.equal(f.plugin.store.data.history[0]!.correct, 4);
  assert.match(f.root().textContent!, /Сохранено/);
  assert.equal(f.timers.size, 0);
});

test('DOM: слова — ограниченный выбор, смена ответа и проверка набора', async t => {
  const f = await fixture(t); f.choose('Слова'); f.click('Начать');
  const shown = [...f.root().querySelectorAll('.cmg-word')].map(el => el.textContent!);
  f.tick(10000);
  const find = (word: string) => [...f.root().querySelectorAll<HTMLButtonElement>('.cmg-word')].find(el => el.textContent === word)!;
  [...shown].reverse().forEach(word => find(word).click());
  assert.equal(f.root().querySelectorAll('.cmg-word[aria-pressed="true"]').length, 4);
  assert.equal(f.root().querySelectorAll('.cmg-word:disabled').length, 4);
  find(shown[0]!).click(); assert.equal(f.root().querySelectorAll('.cmg-word:disabled').length, 0);
  find(shown[0]!).click(); f.click('Подтвердить'); await settle();
  assert.equal(f.plugin.store.data.history[0]!.correct, 4);
});

test('DOM: расположение — пиктограммы скрыты при ответе, один выбор сохраняет результат', async t => {
  const f = await fixture(t); f.choose('Расположение'); f.click('Начать');
  const cells = [...f.root().querySelectorAll('.cmg-cell')];
  const shown = cells.map(el => el.querySelector('.cmg-cell-label')?.textContent);
  assert.equal(shown.filter(Boolean).length, 3);
  f.tick(8000);
  assert.equal(f.root().querySelectorAll('.cmg-cell .cmg-icon').length, 0);
  const question = f.root().querySelector('.cmg-target')!.textContent!;
  const index = shown.findIndex(label => label && question.includes(`«${label}»`));
  assert.ok(index >= 0);
  const cell = f.root().querySelectorAll<HTMLButtonElement>('.cmg-cell')[index]!;
  cell.click(); cell.click(); await settle();
  assert.equal(f.plugin.store.data.history.length, 1);
  assert.equal(f.plugin.store.data.history[0]!.correct, 1);
});

test('DOM: последовательные повторы показаны отдельными импульсами; ошибка завершает ответ', async t => {
  const f = await fixture(t); t.mock.method(Math, 'random', () => 0);
  f.choose('Последовательность'); f.click('Начать');
  assert.equal(f.root().querySelectorAll('.cmg-tile:disabled').length, 4);
  f.tick(500); assert.equal(f.root().querySelectorAll('.is-lit').length, 1);
  f.tick(600); assert.equal(f.root().querySelectorAll('.is-lit').length, 0);
  f.tick(250); assert.equal(f.root().querySelectorAll('.is-lit').length, 1);
  f.tick(600); assert.equal(f.root().querySelectorAll('.is-lit').length, 0);
  f.tick(250); assert.equal(f.root().querySelectorAll('.is-lit').length, 1);
  f.tick(850); assert.equal(f.root().querySelectorAll('.is-lit').length, 0);
  const tiles = f.root().querySelectorAll<HTMLButtonElement>('.cmg-tile');
  tiles[0]!.click(); tiles[1]!.click(); await settle();
  assert.equal(f.plugin.store.data.history[0]!.correct, 1);
  assert.match(f.root().textContent!, /На шаге 2/);
  assert.equal(f.timers.size, 0);
});

test('DOM: скрытие, фон, закрытие и выгрузка отменяют попытку и очищают таймеры', async t => {
  const f = await fixture(t); f.choose('Числа'); f.click('Начать');
  f.workspace.active = { view: {} }; f.events.get('active-leaf-change')!.forEach(fn => fn());
  assert.match(f.root().textContent!, /отменена без оценки/); assert.equal(f.timers.size, 0);
  f.tick(60000); assert.equal(f.plugin.store.data.history.length, 0);
  f.workspace.active = f.workspace.leaves[0]; f.click('Продолжить с новым заданием');
  f.tick(8000); f.win.dispatchEvent(new f.win.Event('blur'));
  assert.match(f.root().textContent!, /отменена без оценки/);
  f.click('Продолжить с новым заданием');
  Object.defineProperty(f.win.document, 'hidden', { value: true, configurable: true });
  f.win.document.dispatchEvent(new f.win.Event('visibilitychange'));
  assert.equal(f.timers.size, 0); assert.equal(f.plugin.store.data.history.length, 0);
  Object.defineProperty(f.win.document, 'hidden', { value: false, configurable: true });
  f.click('Продолжить с новым заданием');
  f.plugin.onunload(); assert.equal(f.timers.size, 0);
  assert.deepEqual(f.plugin.store.data.adaptive.numbers.recent, []);
  f.plugin.gameModal?.close();
  assert.ok([...f.events.values()].every(listeners => listeners.size === 0));
});

test('DOM: повторное открытие сохраняет один Modal, после возврата ввод заметки свободен', async t => {
  const f = await fixture(t);
  await Promise.all([f.plugin.openGames(), f.plugin.openGames()]);
  f.app.ribbon(); await settle(); await f.app.commands.get('open-games')();
  assert.equal(f.workspace.getLeavesOfType(VIEW_TYPE).length, 0);
  assert.equal(f.win.document.querySelectorAll('.cmg-modal').length, 1);
  f.choose('Числа'); f.click('Начать'); f.click('Закончить'); f.click('Отменить попытку и закончить');
  assert.match(f.root().textContent!, /Завершённых попыток пока нет/);
  f.click('Вернуться к заметкам'); await settle();
  assert.equal(f.workspace.leaves.length, 0); assert.equal(f.timers.size, 0);
  const note = f.win.document.body.appendChild(f.win.document.createElement('textarea')); note.focus();
  const key = new f.win.KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true }); note.dispatchEvent(key);
  assert.equal(key.defaultPrevented, false);
});

test('DOM: ручной уровень сохраняется, ошибка записи повторяется без дубля, данные переживают перезагрузку', async t => {
  const f = await fixture(t); t.mock.method(Math, 'random', () => 0);
  f.choose('Числа'); f.click('Посложнее'); await settle();
  assert.match(f.root().querySelector('.cmg-difficulty .cmg-chip')!.getAttribute('title')!, /Ручной уровень сохранится/);
  f.click('Начать'); f.tick(8000); f.app.failSave = true;
  const input = f.root().querySelector('input')!; input.value = '00000'; input.dispatchEvent(new f.win.Event('input'));
  f.click('Готово'); await settle(); assert.match(f.root().textContent!, /Не удалось сохранить результат/);
  assert.equal(f.plugin.store.data.history.length, 0);
  f.app.failSave = false; f.click('Повторить сохранение'); await settle();
  assert.equal(f.plugin.store.data.history.length, 1);
  assert.equal(f.plugin.store.data.history[0]!.mode, 'free-manual');
  const reloaded = new Brumalt(f.app, { id: 'brumalt' } as never);
  await reloaded.onload(); t.after(() => reloaded.onunload());
  assert.equal(reloaded.store.data.history.length, 1);
  assert.deepEqual(reloaded.store.data.settings.practice.numbers, { manual: true, level: 2 });
  assert.equal(reloaded.store.data.adaptive.numbers.level, 1);
});

test('DOM: полная автоматическая сессия из трёх игр сохраняется и завершается итогом', async t => {
  const f = await fixture(t);
  f.click('Играть');
  assert.match(f.root().textContent!, /Игра 1 из 3/);
  f.click('Заменить');
  f.click('Начать');
  for (let attempt = 0; attempt < 9; attempt++) {
    const title = f.root().querySelector('h1')!.textContent;
    if (title === 'Числа') {
      const digits = f.root().querySelector('.cmg-digits')!.textContent!; f.tick(8000);
      const input = f.root().querySelector('input')!; input.value = digits; input.dispatchEvent(new f.win.Event('input')); f.click('Готово');
    } else if (title === 'Слова') {
      const words = [...f.root().querySelectorAll('.cmg-word')].map(el => el.textContent); f.tick(10000);
      for (const word of words) [...f.root().querySelectorAll<HTMLButtonElement>('.cmg-word')].find(el => el.textContent === word)!.click();
      f.click('Подтвердить');
    } else if (title === 'Расположение') {
      const objects = [...f.root().querySelectorAll('.cmg-cell')].map(el => el.querySelector('.cmg-cell-label')?.textContent); f.tick(8000);
      const target = f.root().querySelector('.cmg-target')!.textContent!;
      const index = objects.findIndex(label => label && target.includes(`«${label}»`));
      f.root().querySelectorAll<HTMLButtonElement>('.cmg-cell')[index]!.click();
    } else if (title === 'Правило' || title === 'Порядок') {
      const c = (f.plugin.gameModal as any).attempt.challenge;
      const index = c.game === 'rule' ? c.answer : c.objects.indexOf(c.solution[c.position]);
      f.root().querySelectorAll<HTMLButtonElement>('.cmg-options button')[index]!.click();
    } else {
      const steps: string[] = []; f.tick(500);
      for (let step = 0; step < 3; step++) { steps.push(f.root().querySelector('.is-lit')!.getAttribute('aria-label')!); f.tick(850); }
      for (const step of steps) f.root().querySelector<HTMLButtonElement>(`.cmg-tile[aria-label="${step}"]`)!.click();
      assert.ok(steps.every(step => [0, 1, 2, 3].some(index => tileName('ru', index) === step)));
    }
    await settle(); f.click('Дальше');
    if (attempt === 2 || attempt === 5) f.click('Начать');
  }
  assert.match(f.root().textContent!, /Хорошая пауза/);
  assert.equal(f.plugin.store.data.history.length, 9);
  assert.equal(new Set(f.plugin.store.data.history.map((r: AttemptRecord) => r.game)).size, 3);
  assert.equal(f.timers.size, 0);
  f.click('Главная'); f.click('Прогресс');
  assert.equal(f.root().querySelectorAll('.cmg-progress-card').length, 6);
  assert.match(f.root().textContent!, /Рекорд при этих условиях/);
});

test('Modal: повторный вызов не меняет попытку; Escape возвращает фокус и освобождает ресурсы', async t => {
  const f = await fixture(t); f.plugin.gameModal!.close();
  const note = f.win.document.body.appendChild(f.win.document.createElement('textarea')); note.value = 'Демонстрационная заметка'; note.focus();
  const leaf = { view: { note } }; f.workspace.active = leaf;
  await f.plugin.openGames(); f.choose('Числа');
  const oldStart = [...f.root().querySelectorAll('button')].find(b => b.textContent === 'Начать')!;
  oldStart.click(); const modal = f.plugin.gameModal; const attempt = (modal as any).attempt;
  await f.app.commands.get('open-games')(); f.app.ribbon();
  assert.equal(f.plugin.gameModal, modal); assert.equal((modal as any).attempt, attempt); assert.equal(attempt.phase, 'show');
  f.win.document.dispatchEvent(new f.win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  f.click('Отменить попытку и закрыть');
  assert.equal(f.plugin.gameModal, null); assert.equal(attempt.phase, 'interrupted'); assert.equal(f.timers.size, 0);
  assert.equal(f.win.document.activeElement, note); assert.equal(f.workspace.active, leaf); assert.equal(note.value, 'Демонстрационная заметка');
  oldStart.click(); assert.equal(f.timers.size, 0);
  for (const key of ['1', 'Enter', 'Backspace']) {
    const event = new f.win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }); note.dispatchEvent(event); assert.equal(event.defaultPrevented, false);
  }
  assert.ok([...f.events.values()].every(listeners => listeners.size === 0), 'Все локальные события Modal удалены');
});

test('Восстановленная вкладка 0.1.x показывает рабочий переход к единственному Modal', async t => {
  const f = await fixture(t); f.plugin.gameModal!.close();
  const leaf = f.workspace.getLeaf(); await leaf.setViewState({ type: VIEW_TYPE });
  assert.match(leaf.view.contentEl.textContent, /небольшом окне/);
  leaf.view.contentEl.querySelector('button').click(); await settle();
  assert.ok(f.plugin.gameModal); assert.equal(f.workspace.getLeavesOfType(VIEW_TYPE).length, 0);
  assert.equal(f.win.document.querySelectorAll('.cmg-modal').length, 1);
});

for (const [game, title] of [['rule', 'Правило'], ['order', 'Порядок']] as const) {
  test(`DOM: ${title}, условия остаются, один ответ и сохранённый дневной прогресс`, async t => {
    const f = await fixture(t); f.choose(title); f.click('Начать');
    assert.equal(f.root().querySelector('[data-phase]')!.getAttribute('data-phase'), 'answer');
    assert.equal(f.timers.size, 0); assert.ok(!f.root().textContent!.includes('Запомнил'));
    const c = (f.plugin.gameModal as any).attempt.challenge;
    const index = game === 'rule' ? (c.answer + 1) % 4 : c.objects.indexOf(c.solution[c.position]);
    const answer = f.root().querySelectorAll<HTMLButtonElement>('.cmg-options button')[index]!;
    answer.click(); answer.click(); await settle();
    const record = f.plugin.store.data.history[0]!;
    assert.equal(record.correct, game === 'rule' ? 0 : 1); assert.equal(record.displayEnd, 'visible'); assert.equal(record.displayMs, 0);
    assert.equal(f.plugin.store.data.daily.days[0]!.count, 1);
    assert.ok(f.root().querySelector('.cmg-explanation'));
    const key = new f.win.KeyboardEvent('keyup', { key: 'Enter', bubbles: true }); f.root().dispatchEvent(key);
    assert.equal(f.root().querySelector('[data-phase]')!.getAttribute('data-phase'), 'result');
    f.click('Закончить'); assert.match(f.root().textContent!, /Сегодня: 2 \/ 6/);
    f.click('Главная'); f.click('Прогресс'); assert.equal(f.win.document.querySelectorAll('.cmg-modal').length, 1);
    assert.equal(f.root().querySelectorAll('.cmg-week [role="listitem"]').length, 7);
  });
}

test('Modal: счётчик переходит через полночь без напоминания, календарный таймер очищается при выгрузке', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-15T23:59:59') });
  const f = await fixture(t); t.mock.method(Math, 'random', () => 0);
  f.choose('Числа'); f.click('Начать'); f.click('Запомнил');
  const input = f.root().querySelector('input')!; input.value = '0000'; input.dispatchEvent(new f.win.Event('input')); f.click('Готово'); await settle();
  f.click('Закончить'); assert.match(f.root().textContent!, /Сегодня: 2 \/ 6/);
  t.mock.timers.tick(2000); f.tick(2000);
  assert.match(f.root().textContent!, /Сегодня: 0 \/ 6/);
  assert.equal(f.plugin.store.data.daily.days[0]!.day, '2026-11-15');
  assert.equal(f.plugin.store.data.settings.reminder.enabled, false);
  assert.ok(!notices.some(message => message.includes('Небольшая пауза на игру')));
  f.plugin.gameModal!.close(); assert.equal(f.timers.size, 0); assert.equal(f.allTimers.size, 1);
  f.plugin.onunload(); assert.equal(f.allTimers.size, 0);
});

test('Polish: settings-only language change waits for save, repeats share a write, failure preserves choice and Automatic persists', async context => {
  const f = await fixture(context); const modal = f.plugin.gameModal;
  assert.equal(f.root().lang, 'ru'); assert.equal(f.root().querySelector('[data-language]'), null);
  const selectLanguage = (value: string) => {
    f.app.settingsTab.display(); const select = f.app.settingsTab.containerEl.querySelector('select')!;
    select.value = value; select.dispatchEvent(new f.win.Event('change')); return select;
  };
  const gate = deferred(); f.app.saveGate = gate.promise; context.after(() => gate.resolve());
  const select = selectLanguage('en'); select.dispatchEvent(new f.win.Event('change')); await settle();
  assert.equal(f.app.saveAttempts, 1); assert.equal(f.plugin.language, 'ru');
  assert.equal(f.app.settingsTab.containerEl.querySelector('select')!.disabled, true);
  assert.equal(f.root().querySelector<HTMLButtonElement>('.cmg-primary')!.disabled, true);
  gate.resolve(); await settle(); f.app.saveGate = undefined;
  assert.equal(f.plugin.language, 'en'); assert.equal(f.app.disk.settings.language, 'en');
  assert.equal(f.root().lang, 'en'); assert.equal(f.app.command.name, 'Open Brumalt');
  await f.plugin.openGames(); f.app.ribbon(); assert.equal(f.plugin.gameModal, modal);
  assert.equal(f.win.document.querySelectorAll('.cmg-modal').length, 1);
  f.app.failSave = true; selectLanguage('ru'); await settle();
  assert.equal(f.plugin.language, 'en'); assert.ok(notices.some(n => n.includes('Could not save the language')));
  f.app.failSave = false; selectLanguage('ru'); await settle(); assert.equal(f.plugin.language, 'ru');
  setHostLanguage('en'); selectLanguage('auto'); await settle();
  assert.equal(f.plugin.language, 'en'); assert.equal(f.plugin.store.data.settings.language, 'auto');
  assert.match(f.app.settingsTab.containerEl.textContent, /Daily goal points/);
  const goal = f.app.settingsTab.containerEl.querySelector('select[aria-label="Daily goal points"]');
  assert.deepEqual([...goal.options].map((option: HTMLOptionElement) => option.text), ['6 points', '9 points', '12 points', 'No daily target']);
  f.plugin.gameModal!.close(); await f.plugin.openGames(); assert.equal(f.root().querySelector('h1')!.textContent, 'Brumalt');
  f.choose('Words'); f.click('Start');
  assert.equal(f.root().querySelector('[data-language]'), null);
  await f.plugin.setLanguage('ru'); assert.equal(f.plugin.language, 'en');
  f.app.settingsTab.display(); assert.equal(f.app.settingsTab.containerEl.querySelector('select')!.disabled, true);
});

for (const language of ['ru', 'en'] as const) {
  test(`Polish ${language}: home hierarchy, six full game flows, compact back navigation and localized weekly tooltips`, async context => {
    const f = await fixture(context); context.mock.method(Math, 'random', () => 0);
    if (language === 'en') { await f.plugin.setLanguage('en'); await settle(); }
    const tr = (key: Parameters<typeof translate>[1]) => translate(language, key);
    const checkText = () => {
      assert.doesNotMatch(f.root().textContent!, /\{\w+\}/);
      if (language === 'en') assert.doesNotMatch(f.root().textContent!, /[А-Яа-яЁё]/);
    };
    assert.deepEqual([...f.root().children].map(el => el.className), ['cmg-header', 'cmg-hero', 'cmg-daily', 'cmg-cards', 'cmg-weekly']);
    assert.equal(f.root().querySelectorAll('.cmg-card').length, 6);
    for (const id of GAME_IDS) {
      const card = f.root().querySelector(`[data-game="${id}"]`)!;
      assert.equal(card.querySelectorAll('.cmg-caption').length, 1);
      assert.ok(!card.textContent!.includes(gameText(language, id, 'rule')));
    }
    f.click(tr('progress')); assert.equal(f.root().querySelector('h1')!.textContent, tr('progress'));
    assert.equal(f.root().querySelector('.cmg-back')!.textContent, tr('back'));
    f.click(tr('back')); assert.ok(f.root().querySelector('.cmg-hero'));
    for (const game of GAME_IDS) {
      f.root().querySelector<HTMLButtonElement>(`[data-game="${game}"]`)!.click();
      assert.equal(f.root().querySelectorAll('.cmg-instruction').length, 1);
      assert.equal(f.root().querySelector<HTMLDetailsElement>('.cmg-hint')!.open, false);
      checkText(); f.click(tr('start'));
      const c = (f.plugin.gameModal as any).attempt.challenge;
      if (game === 'sequence') f.tick(c.params.showMs);
      else if (['numbers', 'words', 'location'].includes(game)) f.click(tr('ready'));
      checkText();
      if (game === 'numbers') {
        const input = f.root().querySelector('input')!; input.value = c.digits; input.dispatchEvent(new f.win.Event('input'));
        input.dispatchEvent(new f.win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      } else if (game === 'words') {
        for (const b of f.root().querySelectorAll<HTMLButtonElement>('.cmg-word')) if (c.words.includes(b.textContent)) b.click();
        f.click(tr('confirm'));
      } else if (game === 'location') f.root().querySelectorAll<HTMLButtonElement>('.cmg-cell')[c.objects[c.target].cell]!.click();
      else if (game === 'sequence') for (const step of c.steps) f.root().querySelectorAll<HTMLButtonElement>('.cmg-tile')[step]!.click();
      else f.root().querySelectorAll<HTMLButtonElement>('.cmg-options button')[game === 'rule' ? c.answer : c.objects.indexOf(c.solution[c.position])]!.click();
      await settle(); checkText();
      assert.equal(f.root().querySelector('[data-phase]')!.getAttribute('data-phase'), 'result');
      assert.equal(f.plugin.store.data.history.at(-1)!.correct, f.plugin.store.data.history.at(-1)!.total);
      if (game === 'words') assert.equal(f.plugin.store.data.history.at(-1)!.materialLanguage, language);
      f.click(tr('finish')); assert.equal(f.root().querySelector('.cmg-summary-actions .cmg-primary')!.textContent, tr('backNotes'));
      f.click(tr('returnHome')); f.click(tr('progress')); checkText();
      assert.equal(f.root().querySelectorAll('.cmg-progress-card').length, 6);
      if (f.plugin.store.data.history.length === 6) assert.ok(f.root().querySelector('.cmg-radar-area'));
      for (const details of f.root().querySelectorAll<HTMLDetailsElement>('details.cmg-progress-card')) assert.equal(details.open, false);
      const days = f.root().querySelectorAll<HTMLElement>('.cmg-day'); assert.equal(days.length, 7);
      for (const day of days) {
        const tip = day.querySelector('[role="tooltip"]')!; assert.equal(day.getAttribute('aria-describedby'), tip.id); assert.equal(day.tabIndex, 0);
        assert.doesNotMatch(tip.textContent!, /undefined|\{\w+\}/);
      }
      f.click(tr('back')); assert.ok(f.root().querySelector('.cmg-hero'));
    }
    assert.equal(f.plugin.store.data.history.length, 6);
    assert.equal(f.plugin.store.data.daily.days[0]!.points, 12);
    assert.equal(f.plugin.store.data.daily.days[0]!.count, 6);
    assert.equal(f.root().querySelectorAll('.cmg-day-complete').length, 1);
    f.plugin.gameModal!.containerEl.querySelector<HTMLElement>('.modal-close-button')!.click();
    assert.equal(f.plugin.gameModal, null); assert.equal(f.timers.size, 0);
  });
}

test('Polish: localized reminders use remaining points, successful repetition does not complete the goal', async context => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-15T19:00:00') });
  const f = await fixture(context); context.mock.method(f.win.document, 'hasFocus', () => true);
  await f.plugin.setLanguage('en'); await settle();
  f.choose('Rule'); f.click('Start');
  const c = (f.plugin.gameModal as any).attempt.challenge;
  f.root().querySelectorAll<HTMLButtonElement>('.cmg-options button')[c.answer]!.click(); await settle();
  assert.equal(f.plugin.store.data.daily.days[0]!.points, 2);
  await f.plugin.setReminder(true); await settle(); assert.ok(!notices.some(n => n.includes('small game break')));
  f.plugin.gameModal!.close(); await settle();
  const reminder = notices.find(n => n.includes('small game break'))!;
  assert.match(reminder, /4 points left today/); assert.match(reminder, /Open Brumalt/); assert.match(reminder, /Turn off reminders/); assert.doesNotMatch(reminder, /[А-Яа-яЁё]/);
  f.win.dispatchEvent(new f.win.Event('focus')); await settle(); assert.equal(notices.filter(n => n.includes('small game break')).length, 1);
});

test('Navigation regression: setup has a header route home without closing the Modal', async context => {
  const f = await fixture(context); const modal = f.plugin.gameModal;
  f.choose('Числа');
  const back = f.root().querySelector<HTMLButtonElement>('.cmg-header .cmg-back');
  assert.ok(back, 'Setup needs a compact Back action'); back.click();
  assert.ok(f.root().querySelector('.cmg-hero')); assert.equal(f.plugin.gameModal, modal);
});

test('Navigation regression: language selection is absent from the Modal', async context => {
  const f = await fixture(context);
  assert.equal(f.root().querySelector('[data-language]'), null);
  f.app.settingsTab.display(); assert.ok(f.app.settingsTab.containerEl.querySelector('select[aria-label="Язык"]'));
});

test('Navigation: Stay preserves the exact attempt and input, pauses timers, and ignores obsolete confirmation controls', async context => {
  const f = await fixture(context); context.mock.method(Math, 'random', () => 0);
  f.choose('Числа'); assert.equal(f.plugin.gameModal!.screen, 'GameSetup'); f.click('Начать');
  const modal = f.plugin.gameModal!; const attempt = (modal as any).attempt;
  f.tick(1200); const ready = [...f.root().querySelectorAll('button')].find(button => button.textContent === 'Запомнил')!;
  f.click('Назад');
  assert.equal(f.root().getAttribute('role'), 'alertdialog'); assert.equal(f.win.document.activeElement?.textContent, 'Остаться');
  assert.equal(f.win.document.querySelectorAll('.cmg-modal').length, 1); assert.equal(f.timers.size, 0);
  const oldCancel = [...f.root().querySelectorAll('button')].find(button => button.textContent === 'Отменить попытку и вернуться')!;
  f.tick(10000); ready.click(); assert.equal(attempt.phase, 'show');
  await f.plugin.openGames(); assert.equal(f.win.document.activeElement?.textContent, 'Остаться');
  f.click('Остаться'); oldCancel.click(); assert.equal(modal.screen, 'GameActive'); assert.equal((modal as any).attempt, attempt);
  f.tick(6799); assert.equal(attempt.phase, 'show'); f.tick(1); assert.equal(attempt.phase, 'answer');
  const input = f.root().querySelector('input')!; input.value = '00'; input.dispatchEvent(new f.win.Event('input'));
  input.focus(); f.tick(500); f.click('Назад'); f.tick(20000); f.click('Остаться');
  assert.equal(f.root().querySelector('input'), input); assert.equal(input.value, '00'); assert.equal(f.win.document.activeElement, input);
  input.value = '0000'; input.dispatchEvent(new f.win.Event('input')); f.click('Готово'); await settle();
  assert.equal(f.plugin.store.data.history.length, 1); assert.equal(f.plugin.store.data.history[0]!.displayMs, 8000);
  assert.equal(f.plugin.store.data.history[0]!.responseMs, 500); assert.equal(f.plugin.store.data.daily.days[0]!.points, 2);
  f.click('Назад'); assert.equal(modal.screen, 'Home'); assert.equal(f.win.document.querySelector('[role="alertdialog"]'), null);
});

test('Navigation: confirmed Home cancels only the unfinished attempt; SessionResult Home and Play again are distinct', async context => {
  const f = await fixture(context); context.mock.method(Math, 'random', () => 0);
  f.choose('Числа'); f.click('Начать'); f.click('Запомнил');
  let input = f.root().querySelector('input')!; input.value = '0000'; input.dispatchEvent(new f.win.Event('input')); f.click('Готово'); await settle();
  f.click('Ещё попытка'); f.click('Назад'); f.click('Отменить попытку и вернуться');
  assert.equal(f.plugin.gameModal!.screen, 'Home'); assert.equal(f.plugin.store.data.history.length, 1);
  assert.equal(f.plugin.store.data.daily.days[0]!.points, 2); assert.equal(f.timers.size, 0);
  f.choose('Числа'); f.click('Начать'); f.click('Запомнил');
  input = f.root().querySelector('input')!; input.value = '0000'; input.dispatchEvent(new f.win.Event('input')); f.click('Готово'); await settle();
  f.click('Закончить'); assert.equal(f.plugin.gameModal!.screen, 'SessionResult');
  const session = (f.plugin.gameModal as any).session;
  assert.deepEqual([...f.root().querySelectorAll('.cmg-summary-actions button')].map(button => button.textContent), ['Вернуться к заметкам', 'Ещё игру', 'Главная']);
  f.click('Ещё игру'); assert.equal(f.plugin.gameModal!.screen, 'GameSetup');
  assert.notEqual((f.plugin.gameModal as any).session, session); assert.equal((f.plugin.gameModal as any).session.game, 'numbers');
  assert.equal((f.plugin.gameModal as any).session.records.length, 0);
  f.click('Назад'); assert.equal(f.plugin.gameModal!.screen, 'Home');
  f.click('Играть'); f.click('Начать'); f.click('Закончить'); f.click('Отменить попытку и закончить');
  assert.equal(f.plugin.gameModal!.screen, 'SessionResult'); f.click('Главная'); assert.equal(f.plugin.gameModal!.screen, 'Home');
  assert.equal(f.plugin.store.data.history.length, 2);
});

test('Navigation: setup Back works during a slow level write; active result Back keeps a failed save recoverable', async context => {
  const f = await fixture(context); context.mock.method(Math, 'random', () => 0);
  f.choose('Числа'); const gate = deferred(); f.app.saveGate = gate.promise; context.after(() => gate.resolve());
  f.click('Посложнее'); f.click('Назад'); assert.equal(f.plugin.gameModal!.screen, 'Home');
  assert.equal(f.root().querySelector<HTMLButtonElement>('.cmg-primary')!.disabled, true);
  gate.resolve(); await settle(); f.app.saveGate = undefined;
  f.choose('Числа'); assert.match(f.root().textContent!, /5 цифр/); f.click('Начать'); f.click('Запомнил');
  f.app.failSave = true;
  const input = f.root().querySelector('input')!; input.value = '00000'; input.dispatchEvent(new f.win.Event('input')); f.click('Готово');
  f.click('Назад'); await settle(); assert.equal(f.plugin.gameModal!.screen, 'Home');
  assert.match(f.root().textContent!, /Повторить сохранение/); assert.equal(f.plugin.store.data.history.length, 0);
  f.app.failSave = false; f.click('Повторить сохранение'); await settle();
  assert.equal(f.plugin.store.data.history.length, 1); assert.equal(f.plugin.store.data.daily.days[0]!.points, 2);
});

test('Navigation: Escape on confirmation stays; sequence pulses resume; background and unload dispose confirmation without scoring', async context => {
  const f = await fixture(context); context.mock.method(Math, 'random', () => 0);
  f.choose('Последовательность'); f.click('Начать'); f.tick(700);
  const modal = f.plugin.gameModal!; const attempt = (modal as any).attempt;
  const lit = f.root().querySelector('.is-lit'); assert.ok(lit);
  f.plugin.gameModal!.close(); assert.equal(f.root().getAttribute('role'), 'alertdialog'); f.tick(5000);
  f.win.document.dispatchEvent(new f.win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal((modal as any).attempt, attempt); assert.equal(f.root().querySelector('.is-lit'), lit);
  f.tick(399); assert.ok(f.root().querySelector('.is-lit')); f.tick(1); assert.equal(f.root().querySelector('.is-lit'), null);
  f.click('Назад'); f.win.dispatchEvent(new f.win.Event('blur'));
  assert.equal(modal.screen, 'GameSetup'); assert.equal(f.win.document.querySelector('[role="alertdialog"]'), null); assert.equal(f.timers.size, 0);
  assert.equal(f.plugin.store.data.history.length, 0); f.click('Продолжить с новым заданием'); f.click('Назад');
  f.plugin.onunload(); assert.equal(f.plugin.gameModal, null); assert.equal(f.allTimers.size, 0);
  assert.equal(f.win.document.querySelector('.cmg-exit-panel'), null); assert.ok([...f.events.values()].every(listeners => listeners.size === 0));
});

for (const language of ['ru', 'en'] as const) test(`Radar ${language}: six readable HTML labels, SVG axes and text alternative; compact expandable rows handle empty and partial data`, async context => {
  const f = await fixture(context); await f.plugin.setLanguage(language);
  const tr = (key: Parameters<typeof translate>[1]) => translate(language, key);
  f.click(tr('progress'));
  assert.equal(f.plugin.gameModal!.screen, 'Progress');
  assert.equal(f.root().querySelectorAll('.cmg-radar-axis').length, 6);
  const labels = f.root().querySelectorAll('.cmg-radar-label');
  assert.deepEqual([...labels].map(label => label.textContent), GAME_IDS.map(game => gameText(language, game, 'name')));
  assert.equal(f.root().querySelectorAll('svg text').length, 0, 'Axis labels remain HTML so narrowing the SVG does not shrink their font');
  assert.equal(f.root().querySelectorAll('.cmg-radar-point').length, 0); assert.ok(f.root().querySelector('.cmg-radar-area')); assert.equal(f.root().querySelectorAll('.cmg-radar-missing').length, 6);
  assert.equal(f.root().querySelectorAll('details.cmg-progress-card').length, 6);
  assert.ok([...f.root().querySelectorAll<HTMLDetailsElement>('details.cmg-progress-card')].every(row => !row.open));
  const svg = f.root().querySelector('.cmg-radar svg')!;
  assert.ok(f.win.document.getElementById(svg.getAttribute('aria-labelledby')!)!.textContent);
  assert.equal(f.win.document.getElementById(svg.getAttribute('aria-describedby')!)!.querySelectorAll('li').length, 6);
  f.click(tr('back')); f.choose(gameText(language, 'rule', 'name')); f.click(tr('start'));
  const c = (f.plugin.gameModal as any).attempt.challenge;
  f.root().querySelectorAll<HTMLButtonElement>('.cmg-options button')[c.answer]!.click(); await settle(); f.click(tr('back')); f.click(tr('progress'));
  assert.equal(f.root().querySelectorAll('.cmg-radar-point').length, 1); assert.ok(f.root().querySelector('.cmg-radar-area')); assert.equal(f.root().querySelectorAll('.cmg-radar-missing').length, 5);
  const rows = f.root().querySelectorAll<HTMLDetailsElement>('details.cmg-progress-card');
  rows[4]!.querySelector('summary')!.click(); assert.equal(rows[4]!.open, true); assert.equal(rows[4]!.querySelectorAll('.cmg-history li').length, 1);
  assert.match(rows[4]!.textContent!, /1\/1/);
  assert.equal(f.root().querySelector('[data-language]'), null);
});

test('Navigation: returning Home wakes a deferred reminder; English confirmation stays inside the same Modal', async context => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-15T19:00:00') });
  const f = await fixture(context); context.mock.method(f.win.document, 'hasFocus', () => true);
  await f.plugin.setLanguage('en'); f.choose('Words'); f.click('Start');
  await f.plugin.setReminder(true); await settle(); assert.ok(!notices.some(n => n.includes('small game break')));
  f.click('Back'); assert.equal(f.root().lang, 'en'); assert.equal(f.root().getAttribute('role'), 'alertdialog');
  assert.match(f.root().textContent!, /Leave this attempt/); assert.equal(f.win.document.querySelectorAll('.cmg-modal').length, 1);
  f.click('Cancel attempt & return'); await settle(); assert.equal(f.plugin.gameModal!.screen, 'Home');
  assert.equal(notices.filter(n => n.includes('6 points left today')).length, 1);
  assert.equal(f.plugin.store.data.history.length, 0); assert.equal(f.plugin.store.data.daily.days[0]!.points, 0);
  f.click('Progress'); f.click('Back'); await settle(); assert.equal(notices.filter(n => n.includes('small game break')).length, 1);
});


test('0.3.3 regression: native sibling close remains and the custom header close is absent', async t => {
  const f = await fixture(t);
  const style = f.win.document.createElement('style');
  style.textContent = (await readFile('styles.css', 'utf8')).match(/[^{}]*\.modal-close-button[^{}]*\{[^{}]*\}/g)?.join('\n') ?? '';
  f.win.document.head.appendChild(style);
  const native = f.plugin.gameModal!.containerEl.querySelector<HTMLElement>('.modal-close-button')!;
  assert.notEqual(f.win.getComputedStyle(native).display, 'none');
  assert.equal(f.root().querySelectorAll('.cmg-header [aria-label="Закрыть"]').length, 0);
});

test('0.3.2 regression: duration changes in place without a temporary saving label', async t => {
  const f = await fixture(t); const gate = deferred(); f.app.saveGate = gate.promise; t.after(() => gate.resolve());
  const hero = f.root().querySelector('.cmg-hero'); const five = f.root().querySelector('.cmg-duration button:last-child');
  f.click('5 мин');
  assert.equal(f.root().querySelector('.cmg-hero'), hero);
  assert.equal(f.root().querySelector('.cmg-duration button:last-child'), five);
  assert.doesNotMatch(f.root().textContent!, /Сохраняем|Сохраняется|Сохранение|Сохраняем 5/);
});


test('0.3.3: one native close across five states, sibling/nested placement, safe exit and backdrop/Escape', async t => {
  const f = await fixture(t); const modal = f.plugin.gameModal!;
  const style = f.win.document.createElement('style');
  style.textContent = (await readFile('styles.css', 'utf8')).match(/[^{}]*\.modal-close-button[^{}]*\{[^{}]*\}/g)?.join('\n') ?? '';
  f.win.document.head.appendChild(style);
  const native = modal.containerEl.querySelector<HTMLElement>('.modal-close-button')!;
  const check = (state: string) => {
    assert.equal(modal.screen, state); assert.notEqual(f.win.getComputedStyle(native).display, 'none');
    const x = f.root().querySelectorAll<HTMLButtonElement>('.cmg-header [aria-label="Закрыть"]');
    assert.equal(x.length, 0); assert.equal(modal.containerEl.querySelectorAll('.modal-close-button').length, 1);
    assert.equal(f.root().querySelectorAll('.cmg-back').length, state === 'Home' ? 0 : 1);
    assert.notEqual(f.root().querySelector('.cmg-back'), native);
  };
  check('Home'); f.click('Прогресс'); check('Progress'); f.click('Назад'); check('Home');
  f.choose('Правило'); check('GameSetup'); f.click('Начать'); check('GameActive');
  modal.modalEl.appendChild(native); check('GameActive'); // Older hosts place this inside modalEl.
  native.click();
  assert.ok(f.win.document.querySelector('[role="alertdialog"]')); assert.equal(f.plugin.gameModal, modal);
  f.win.document.dispatchEvent(new f.win.KeyboardEvent('keydown', { key: 'Escape' })); check('GameActive');
  const c = (modal as any).attempt.challenge;
  f.root().querySelectorAll<HTMLButtonElement>('.cmg-options button')[c.answer]!.click(); await settle();
  f.click('Закончить'); check('SessionResult'); f.click('Главная'); check('Home');
  const other = new Modal(f.app); other.open();
  assert.notEqual(f.win.getComputedStyle(other.closeButtonEl).display, 'none', 'Other plugins retain native close'); other.close();
  native.click(); assert.equal(Boolean(f.plugin.gameModal), false);
  await f.plugin.openGames(); f.plugin.gameModal!.containerEl.querySelector<HTMLElement>('.modal-bg')!.click(); assert.equal(Boolean(f.plugin.gameModal), false);
  await f.plugin.openGames(); f.choose('Числа'); f.click('Начать');
  f.plugin.gameModal!.containerEl.querySelector<HTMLElement>('.modal-bg')!.click(); f.click('Отменить попытку и закрыть');
  assert.equal(Boolean(f.plugin.gameModal), false); assert.equal(f.timers.size, 0); assert.equal(f.plugin.store.data.history.length, 1);
});

test('0.3.2: rapid durations coalesce to latest, preserve DOM/focus and keep serial settings writes', async t => {
  const f = await fixture(t); const first = deferred(); const second = deferred(); t.after(() => { first.resolve(); second.resolve(); });
  const written: number[] = []; const save = f.plugin.saveData.bind(f.plugin);
  t.mock.method(f.plugin, 'saveData', async (data: SavedData) => { written.push(data.settings.minutes); await save(data); });
  const hero = f.root().querySelector('.cmg-hero');
  const one = f.root().querySelector<HTMLButtonElement>('.cmg-duration [data-minutes="1"]')!;
  f.click('3 мин'); f.click('5 мин'); f.app.saveGate = first.promise; await settle();
  one.focus(); one.click(); f.click('5 мин'); one.click();
  assert.equal(f.win.document.activeElement, one); assert.equal(one.disabled, false);
  assert.equal(f.root().querySelector('.cmg-hero'), hero); assert.equal(f.plugin.minutes, 1);
  assert.equal(f.plugin.store.data.settings.minutes, 3); assert.match(f.root().querySelector('.cmg-plan')!.textContent!, /1 игра/);
  f.app.saveGate = second.promise; first.resolve(); await settle(); assert.deepEqual(written, [5, 1]);
  const change = f.plugin.store.settings(settings => { settings.language = 'en'; });
  f.click('Играть'); // Directly queued unrelated configuration still blocks a dependent start.
  assert.equal(f.plugin.gameModal!.screen, 'Home');
  second.resolve(); await change; await settle();
  assert.deepEqual(written, [5, 1, 1]); assert.equal(f.app.disk.settings.language, 'en');
  assert.equal(f.app.disk.settings.minutes, 1); assert.equal(Boolean(f.plugin.durationChange), false);
  f.plugin.refreshViews(); f.click('Play'); assert.equal((f.plugin.gameModal as any).session.minutes, 1);
});

test('0.3.2: superseded duration failure is quiet; latest failure offers retry or restore without layout changes', async t => {
  const f = await fixture(t); await f.plugin.setLanguage('en');
  const gate = deferred(); t.after(() => gate.resolve()); f.app.saveGate = gate.promise;
  const hero = f.root().querySelector('.cmg-hero');
  f.click('5 min'); await settle(); f.click('3 min'); f.app.failSave = true;
  gate.resolve(); await settle(); assert.equal(f.plugin.minutes, 3); assert.equal(Boolean(f.plugin.durationChange), false);
  assert.equal(notices.length, 0, 'Obsolete failures do not alert for an already-saved latest choice');
  const before = f.app.saveAttempts; f.click('1 min'); await settle();
  assert.equal(f.plugin.durationChange?.status, 'error'); assert.equal(f.plugin.minutes, 1);
  assert.equal(f.root().querySelector('.cmg-hero'), hero);
  assert.match(noticeFragments.at(-1)!.textContent!, /Could not save 1 min/);
  const restore = [...noticeFragments.at(-1)!.querySelectorAll('button')].find(b => b.textContent === 'Use saved duration')!;
  restore.click(); await settle(); assert.equal(f.plugin.minutes, 3); assert.equal(Boolean(f.plugin.durationChange), false);
  assert.equal(f.app.saveAttempts, before + 1, 'Restore to saved value needs no write');
  f.click('5 min'); await settle(); f.app.failSave = false;
  const retry = [...noticeFragments.at(-1)!.querySelectorAll('button')].find(b => b.textContent === 'Retry selection')!;
  retry.click(); retry.click(); await settle(); assert.equal(f.app.disk.settings.minutes, 5);
  assert.equal(f.root().querySelector('.cmg-hero'), hero);
  f.plugin.gameModal!.close(); await f.plugin.openGames(); assert.equal(f.root().querySelector('.cmg-duration [aria-pressed="true"]')!.textContent, '5 min');
});

for (const language of ['en', 'ru'] as const) test(`0.3.2 ${language}: local Positions SVG, single-game labels, explicit daily points and truthful missing radar floor`, async context => {
  const f = await fixture(context); await f.plugin.setLanguage(language);
  const tr = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const points = (n: number) => translate(language, 'todayProgress', { points: n, goal: 6 });
  const checkIcon = (el: Element) => {
    const svg = el.querySelector('svg')!; assert.ok(svg);
    assert.equal(svg.getAttribute('viewBox'), '0 0 24 24'); assert.equal(svg.getAttribute('stroke'), 'currentColor');
    assert.equal(svg.getAttribute('stroke-width'), '2'); assert.equal(svg.querySelectorAll('rect').length, 4); assert.equal(svg.querySelectorAll('circle').length, 1);
  };
  checkIcon(f.root().querySelector('[data-game="location"] .cmg-icon')!);
  assert.equal(f.root().querySelector('.cmg-daily-heading strong')!.textContent, points(0));
  f.choose(gameText(language, 'rule', 'name')); assert.equal(f.root().querySelector('.cmg-eyebrow')!.textContent, language === 'en' ? 'Single game' : 'Отдельная игра');
  f.click(tr('start')); const c = (f.plugin.gameModal as any).attempt.challenge;
  f.root().querySelectorAll<HTMLButtonElement>('.cmg-options button')[c.answer]!.click(); await settle();
  f.click(tr('finish')); assert.equal(f.root().querySelector('.cmg-daily-heading strong')!.textContent, points(2));
  f.click(tr('returnHome')); f.click(tr('progress')); assert.equal(f.root().querySelector('.cmg-daily-heading strong')!.textContent, points(2));
  const rows = f.root().querySelectorAll('.cmg-progress-card'); checkIcon(rows[1]!.querySelector('.cmg-icon')!);
  assert.match(rows[4]!.textContent!, language === 'en' ? /Single game · auto/ : /Отдельная игра · авто/);
  const svg = f.root().querySelector('.cmg-radar svg')!;
  const coords = svg.querySelector('.cmg-radar-area')!.getAttribute('points')!.split(' ').map(pair => pair.split(',').map(Number));
  for (let i = 0; i < 6; i++) if (i !== 4) {
    assert.ok(Math.abs(Math.hypot(coords[i]![0]! - 100, coords[i]![1]! - 100) - 8) < .001, 'Missing geometry is 10/100, not zero');
    assert.equal(rows[i]!.querySelector('.cmg-profile-value')!.textContent, '—');
  }
  for (const dot of svg.querySelectorAll('.cmg-radar-missing')) {
    assert.equal(dot.getAttribute('data-score'), null); assert.equal(dot.querySelector('title')!.textContent!.endsWith(tr('profileNoData')), true);
  }
  const alternative = f.win.document.getElementById(svg.getAttribute('aria-describedby')!)!;
  assert.equal([...alternative.querySelectorAll('li')].filter(li => li.textContent!.includes(tr('profileNoData'))).length, 5);
  assert.equal(f.root().querySelector<HTMLElement>('.cmg-radar-label-0')!.title.endsWith(tr('profileNoData')), true);
  const record = f.plugin.store.data.history[0]!;
  for (let i = 0; i < 10; i++) await f.plugin.store.record({ ...record, id: `wrong-${i}`, correct: 0 });
  f.plugin.refreshViews();
  const zero = f.root().querySelector('.cmg-radar-point[data-score="0"]')!;
  assert.ok(zero); assert.equal(zero.getAttribute('cx'), '100'); assert.equal(zero.getAttribute('cy'), '100');
  assert.equal(f.root().querySelectorAll('.cmg-radar-missing').length, 5, 'A real zero remains measured, not a missing-data floor');
  assert.doesNotMatch(f.root().textContent!, /Free play|Free ·|Свободная игра|Свободно ·/);
});


test('0.3.2: duration coalescing and a completed result share the serial store after Modal close', async t => {
  const f = await fixture(t); const gate = deferred(); f.app.saveGate = gate.promise; t.after(() => gate.resolve());
  f.click('5 мин'); await settle(); f.choose('Правило'); f.click('Начать');
  const c = (f.plugin.gameModal as any).attempt.challenge;
  f.root().querySelectorAll<HTMLButtonElement>('.cmg-options button')[c.answer]!.click(); await settle();
  const pending = [...f.plugin.pendingResults.values()][0]!.record;
  const lastDuration = f.plugin.setMinutes(1); f.plugin.gameModal!.close();
  assert.equal(f.plugin.store.data.history.length, 0); assert.equal(f.plugin.pendingResults.size, 1);
  gate.resolve(); await lastDuration; await f.plugin.store.flush(); await settle();
  assert.equal(f.app.disk.settings.minutes, 1); assert.equal(f.app.disk.history[0].id, pending.id);
  assert.equal(f.app.disk.daily.days[0].points, 2); assert.equal(f.app.disk.history.length, 1);
  await f.plugin.saveResult(pending); assert.equal(f.app.writes, 3); assert.equal(f.plugin.pendingResults.size, 0);
  await f.plugin.openGames(); assert.equal(f.root().querySelector('.cmg-duration [aria-pressed="true"]')!.textContent, '1 мин');
});


test('Brumalt: first-run legacy import is visible, same data persists on reopen/reload without another import', async t => {
  const raw = await readFile('tests/fixtures/data-v3.json', 'utf8');
  const f = await fixture(t, raw);
  assert.equal(f.plugin.manifest.id, 'brumalt'); assert.equal(f.root().querySelector('h1')!.textContent, 'Brumalt');
  assert.equal(f.app.command.name, 'Открыть Brumalt'); assert.equal(f.app.writes, 1);
  assert.ok(notices.some(n => /Brumalt.*прежние результаты/.test(n)));
  assert.equal(f.app.legacy, raw); const saved = structuredClone(f.app.disk);
  f.plugin.gameModal!.close(); await f.plugin.openGames(); assert.equal(f.app.writes, 1);
  f.plugin.onunload(); const reloaded = new Brumalt(f.app, { id: 'brumalt' } as never);
  await reloaded.onload(); await reloaded.openGames();
  assert.equal(f.app.writes, 1); assert.deepEqual(reloaded.store.data, saved);
  assert.equal(f.app.legacy, raw); reloaded.onunload();
});
