import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GAME_IDS, type AttemptRecord, type SavedData } from '../src/core/types';
import { MAX_LEVEL, parameters } from '../src/core/config';
import { GAMES } from '../src/games';
import { WORDS } from '../src/games/words';
import { adapt } from '../src/core/adaptation';
import { Attempt } from '../src/core/attempt';
import { Store, defaults, parseData } from '../src/core/storage';
import { Session, planSession, replacement } from '../src/core/session';
import { comparison } from '../src/core/statistics';

let seed = 123456;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
function record(id: string, extra: Partial<AttemptRecord> = {}): AttemptRecord {
  return { id, goalVersion: 2, materialLanguage: null, day: null, dayGoal: null, at: '2026-11-15T10:00:00.000Z', game: 'numbers', mode: 'session-adaptive',
    rulesVersion: 1, level: 1, params: parameters('numbers', 1), elementCount: 4,
    displayMs: 8000, displayEnd: 'timer', responseMs: 1000, correct: 4, total: 4, ...extra };
}

test('Регрессия: допустимые трудные ответы снижают уровни 6 и 7 в Словах', async () => {
  for (const level of [6, 7]) {
    const initial = defaults(); initial.adaptive.words.level = level;
    const store = new Store({ read: async () => initial, write: async () => {} }); await store.load();
    for (let n = 0; n < 4; n++) {
      const challenge = GAMES.words.generate(level, random);
      if (challenge.game !== 'words') throw new Error('game');
      const answer = [...challenge.options.filter(w => !challenge.words.includes(w)), ...challenge.words.slice(4)];
      const attempt = new Attempt(`words-${level}-${n}`, challenge, 'session-adaptive', GAMES.words);
      attempt.show(); attempt.recall(); const result = attempt.finish(answer)!;
      assert.ok(result); assert.equal(result.correct, level - 1);
      await store.record(result);
    }
    assert.equal(store.data.adaptive.words.level, level - 1);
  }
});

test('Генераторы: инварианты и правильные ответы на всех уровнях (100 заданий на уровень)', () => {
  assert.equal(new Set(WORDS).size, WORDS.length);
  for (const game of GAME_IDS) for (let level = 1; level <= MAX_LEVEL[game]; level++) {
    for (let run = 0; run < 100; run++) {
      const c = GAMES[game].generate(level, random);
      const evaluate = GAMES[game].evaluate;
      assert.equal(c.level, level);
      switch (c.game) {
        case 'rule': assert.deepEqual(evaluate(c, c.answer), { correct: 1, total: 1 }); break;
        case 'order': assert.deepEqual(evaluate(c, c.solution[c.position]!), { correct: 1, total: 1 }); break;
        case 'numbers':
          assert.match(c.digits, /^\d+$/); assert.equal(c.digits.length, level + 3);
          assert.deepEqual(evaluate(c, c.digits), { correct: c.params.count, total: c.params.count });
          assert.equal(evaluate(c, c.digits.slice(1)), null);
          assert.equal(evaluate(c, 1234), null); break;
        case 'words':
          assert.equal(new Set(c.options).size, c.options.length);
          assert.equal(c.options.length, c.params.count + 4);
          assert.equal(c.words.length, c.params.count);
          assert.ok(c.words.every(w => c.options.includes(w)));
          assert.equal(c.options.filter(w => !c.words.includes(w)).length, 4);
          assert.deepEqual(evaluate(c, [...c.words].reverse()), { correct: c.params.count, total: c.params.count });
          assert.equal(evaluate(c, c.options), null);
          assert.equal(evaluate(c, Array(c.params.count).fill(c.words[0])), null);
          assert.equal(evaluate(c, [...c.words.slice(1), 'несуществующий-вариант']), null); break;
        case 'location': {
          assert.equal(new Set(c.objects.map(o => o.cell)).size, c.params.count);
          assert.equal(new Set(c.objects.map(o => o.icon)).size, c.params.count);
          assert.ok(c.objects.every(o => o.cell >= 0 && o.cell < c.params.gridSize! ** 2));
          assert.ok(c.objects[c.target]);
          assert.deepEqual(evaluate(c, c.objects[c.target]!.cell), { correct: 1, total: 1 });
          assert.deepEqual(evaluate(c, (c.objects[c.target]!.cell + 1) % (c.params.gridSize! ** 2)), { correct: 0, total: 1 });
          assert.equal(evaluate(c, -1), null); assert.equal(evaluate(c, 1.5), null); break;
        }
        case 'sequence':
          assert.equal(c.steps.length, level + 2); assert.ok(c.steps.every(s => s >= 0 && s <= 3));
          assert.deepEqual(evaluate(c, c.steps), { correct: c.steps.length, total: c.steps.length });
          assert.deepEqual(evaluate(c, [(c.steps[0]! + 1) % 4]), { correct: 0, total: c.steps.length });
          assert.equal(evaluate(c, c.steps.slice(0, -1)), null);
          assert.equal(evaluate(c, [5]), null); break;
      }
    }
  }
});

test('Повторяющиеся плитки допустимы, порядок и правильный префикс оцениваются строго', () => {
  const c = GAMES.sequence.generate(1, () => 0);
  assert.equal(c.game, 'sequence');
  if (c.game !== 'sequence') return;
  assert.deepEqual(c.steps, [0, 0, 0]);
  assert.deepEqual(GAMES.sequence.evaluate(c, [0, 0, 0]), { correct: 3, total: 3 });
  assert.deepEqual(GAMES.sequence.evaluate(c, [0, 1, 0]), { correct: 1, total: 3 });
  assert.deepEqual(GAMES.sequence.evaluate(c, [0, 1]), { correct: 1, total: 3 });
});

test('Слова: частичный набор оценивается независимо от порядка', () => {
  const c = GAMES.words.generate(1, random);
  if (c.game !== 'words') throw new Error('game');
  const distractor = c.options.find(w => !c.words.includes(w))!;
  assert.deepEqual(GAMES.words.evaluate(c, [distractor, ...c.words.slice(1)]), { correct: 3, total: 4 });
});

test('Уровни: только один независимый параметр за шаг, показ не ускоряется', () => {
  for (const game of GAME_IDS) {
    assert.throws(() => parameters(game, 0)); assert.throws(() => parameters(game, MAX_LEVEL[game] + 1));
    for (let level = 2; level <= MAX_LEVEL[game]; level++) {
      const before = parameters(game, level - 1); const after = parameters(game, level);
      const changed = Object.keys(after).filter(k => k !== 'showMs' && before[k as keyof typeof before] !== after[k as keyof typeof after]);
      assert.equal(changed.length, 1); assert.ok(after.showMs >= before.showMs);
    }
  }
});

test('Адаптация: окно, границы, гистерезис и повторяющиеся трудности', () => {
  let state = { level: 1, recent: [] as number[] };
  for (let i = 0; i < 3; i++) { state = adapt(state, 1, 10); assert.equal(state.level, 1); }
  state = adapt(state, 1, 10); assert.equal(state.level, 2); assert.deepEqual(state.recent, []);
  for (let i = 0; i < 3; i++) { state = adapt(state, 0, 10); assert.equal(state.level, 2); }
  state = adapt(state, 0.75, 10); assert.equal(state.level, 1);
  for (let i = 0; i < 30; i++) state = adapt(state, 0, 10);
  assert.equal(state.level, 1);
  for (let i = 0; i < 100; i++) state = adapt(state, 1, 10);
  assert.equal(state.level, 10);
  state = { level: 4, recent: [] };
  for (let i = 0; i < 100; i++) state = adapt(state, i % 2, 10);
  assert.equal(state.level, 4);
});

test('Хранилище: сериализация настроек и результатов, ручной режим и независимые игры', async () => {
  let concurrent = 0; let maxConcurrent = 0;
  let disk = defaults();
  const store = new Store({ read: async () => disk, write: async next => {
    maxConcurrent = Math.max(maxConcurrent, ++concurrent);
    await new Promise(resolve => setTimeout(resolve, 1)); disk = structuredClone(next); concurrent--;
  } });
  await store.load();
  await Promise.all([
    store.record(record('a')), store.settings(s => { s.minutes = 5; }),
    store.record(record('b')), store.record(record('c')), store.record(record('d')),
  ]);
  assert.equal(maxConcurrent, 1); assert.equal(disk.settings.minutes, 5);
  assert.equal(disk.history.length, 4); assert.equal(disk.adaptive.numbers.level, 2);
  assert.equal(disk.adaptive.words.level, 1);
  const before = structuredClone(disk.adaptive);
  await store.settings(s => { s.practice.numbers = { manual: true, level: 8 }; });
  await store.record(record('manual', { mode: 'free-manual', level: 8, params: parameters('numbers', 8), elementCount: 11, correct: 11, total: 11 }));
  assert.deepEqual(store.data.adaptive, before);
  assert.deepEqual(store.data.settings.practice.numbers, { manual: true, level: 8 });
});

test('Неудачная запись: состояние не теряется, повтор сохраняет ровно один раз', async () => {
  let fail = true; let writes = 0;
  const store = new Store({ read: async () => null, write: async () => { writes++; if (fail) throw new Error('disk'); } });
  await store.load();
  const result = record('retry');
  await assert.rejects(store.record(result));
  assert.equal(store.data.history.length, 0); assert.deepEqual(store.data.adaptive.numbers.recent, []);
  fail = false;
  await Promise.all([store.record(result), store.record(result)]);
  assert.equal(store.data.history.length, 1); assert.equal(writes, 2);
  assert.deepEqual(store.data.adaptive.numbers.recent, [1]);
});

test('Повреждённые/неизвестные данные и ошибка чтения блокируют любую перезапись', async () => {
  const bad: unknown[] = [{}, { ...defaults(), schemaVersion: 999 }, { ...defaults(), history: [record('x'), record('x')] }];
  const invalidSettings = defaults(); invalidSettings.settings.enabled = []; bad.push(invalidSettings);
  const invalidParams = defaults(); invalidParams.history = [record('x', { params: { count: 99, showMs: 8000 } })]; bad.push(invalidParams);
  const invalidScores = defaults(); invalidScores.history = [record('x', { correct: 5 })]; bad.push(invalidScores);
  const invalidLevel = defaults(); invalidLevel.adaptive.words.level = 999; bad.push(invalidLevel);
  for (const raw of bad) {
    assert.throws(() => parseData(raw)); let writes = 0;
    const store = new Store({ read: async () => raw, write: async () => { writes++; } });
    await store.load(); assert.ok(store.loadError);
    await assert.rejects(store.record(record('blocked')));
    await assert.rejects(store.settings(s => { s.minutes = 1; })); assert.equal(writes, 0);
  }
  const store = new Store({ read: async () => { throw new Error('read'); }, write: async () => assert.fail('write') });
  await store.load(); assert.ok(store.loadError);
});

test('История ограничена 1000 завершёнными попытками; прерывание ничего не меняет', async () => {
  const initial = defaults();
  initial.history = Array.from({ length: 1000 }, (_, i) => record(String(i)));
  const store = new Store({ read: async () => initial, write: async () => {} });
  await store.load();
  for (const game of GAME_IDS) {
    const before = structuredClone(store.data);
    const attempt = new Attempt('abort-' + game, GAMES[game].generate(1, random), 'session-adaptive', GAMES[game]);
    attempt.show(); attempt.recall(); attempt.interrupt();
    assert.equal(attempt.record, undefined); assert.deepEqual(store.data, before);
  }
  await store.record(record('new')); assert.equal(store.data.history.length, 1000);
  assert.equal(store.data.history[0]!.id, '1'); assert.equal(store.data.history[999]!.id, 'new');
});

test('Сессии: недавние игры, отключённые дисциплины, замены и бюджеты', () => {
  const history = [record('last', { game: 'words' })];
  const plan = planSession([...GAME_IDS], 3, history, random);
  assert.equal(plan.length, 3); assert.equal(new Set(plan).size, 3); assert.notEqual(plan[0], 'words');
  assert.ok(!plan.includes(replacement(plan, [...GAME_IDS], history, random)!));
  assert.deepEqual(planSession(['words'], 5, history), ['words']);
  assert.equal(replacement(['words'], ['words'], history), undefined);
  assert.equal(planSession([...GAME_IDS], 1, history).length, 1);
  assert.throws(() => planSession([], 3, []));
  const short = new Session(['numbers'], 1, false, () => 0);
  const medium = new Session(['numbers', 'words', 'location'], 3, false, () => 0);
  const long = new Session(['numbers', 'words', 'location'], 5, false, () => 0);
  assert.equal(short.attemptsPerBlock, 3); assert.equal(medium.attemptsPerBlock, 3); assert.equal(long.attemptsPerBlock, 5);
  assert.equal(new Session(['words'], 3, false).attemptsPerBlock, 9);
});

test('Сессия заканчивается на границе попытки, без автоматического нового старта', () => {
  let clock = 0; const session = new Session(['numbers', 'words'], 3, false, () => clock);
  session.add(record('a')); session.add(record('a')); assert.equal(session.records.length, 1);
  assert.equal(session.advance(), 'attempt'); clock = 181000;
  assert.equal(session.advance(), 'end');
  const free = new Session(['numbers'], 1, true, () => clock); clock += 10_000_000;
  assert.equal(free.advance(), 'attempt');
  const full = new Session(['numbers', 'words', 'sequence'], 3, false, () => 0);
  for (let i = 0; i < 9; i++) {
    full.add(record(String(i))); const action = full.advance();
    assert.equal(action, i === 8 ? 'end' : (i + 1) % 3 === 0 ? 'block' : 'attempt');
  }
});

test('Рекорды сравниваются внутри правил, режима и всех параметров', () => {
  const target = record('a');
  const otherMode = record('b', { mode: 'free-manual', responseMs: 10 });
  const otherLevel = record('c', { level: 2, params: parameters('numbers', 2), responseMs: 20 });
  const partial = record('d', { correct: 3, responseMs: 5 });
  const best = record('e', { responseMs: 800 });
  const stats = comparison([target, otherMode, otherLevel, partial, best], target);
  assert.equal(stats.recent.length, 3); assert.equal(stats.successes, 2); assert.equal(stats.bestMs, 800);
});

test('Валидная схема выдерживает цикл загрузки и сохранения', () => {
  const data: SavedData = defaults(); data.history.push(record('roundtrip'));
  assert.deepEqual(parseData(JSON.parse(JSON.stringify(data))), data);
});

test('Файловый адаптер: JSON с результатами и настройками читается новым экземпляром', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'cmg-store-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'data.json');
  await writeFile(path, JSON.stringify(defaults()));
  const port = { read: async () => JSON.parse(await readFile(path, 'utf8')),
    write: async (data: SavedData) => { await writeFile(path, JSON.stringify(data)); } };
  const original = new Store(port); await original.load();
  await original.record(record('on-disk')); await original.settings(s => { s.minutes = 5; });
  const restarted = new Store(port); await restarted.load();
  assert.equal(restarted.data.history[0]!.id, 'on-disk');
  assert.equal(restarted.data.settings.minutes, 5);
  assert.deepEqual(restarted.data.adaptive.numbers.recent, [1]);
});
