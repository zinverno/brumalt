import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Store, defaults, parseData } from '../src/core/storage';
import { Attempt } from '../src/core/attempt';
import { comparison } from '../src/core/statistics';
import { GAMES } from '../src/games';
import { GAME_IDS } from '../src/core/types';

for (let level = 1; level <= 7; level++) {
  test(`Слова: достижимые повышение, понижение и устойчивость, уровень ${level}`, async () => {
    for (const errors of [[0, 0, 0, 0], [2, 2, 0, 2], [0, 0, 1, 0], [0, 2, 0, 0]]) {
      const data = defaults(); data.adaptive.words.level = level;
      const store = new Store({ read: async () => data, write: async () => {} }); await store.load();
      for (const [i, wrong] of errors.entries()) {
        const challenge = GAMES.words.generate(level);
        if (challenge.game !== 'words') throw new Error('game');
        const answer = [...challenge.options.filter(word => !challenge.words.includes(word)).slice(0, wrong), ...challenge.words.slice(wrong)];
        assert.equal(answer.length, challenge.params.count); assert.equal(new Set(answer).size, answer.length);
        assert.ok(answer.every(word => challenge.options.includes(word)));
        const attempt = new Attempt(`words-${level}-${i}`, challenge, 'session-adaptive', GAMES.words);
        attempt.show(); attempt.recall(); const record = attempt.finish(answer)!;
        assert.ok(record); assert.equal(record.correct, level + 3 - wrong);
        await store.record(record);
        if (i < 3) assert.equal(store.data.adaptive.words.level, level, 'Не меняем уровень до четырёх попыток');
      }
      const expected = errors.every(n => n === 0) ? Math.min(7, level + 1)
        : errors.filter(n => n >= 2).length >= 3 ? Math.max(1, level - 1) : level;
      assert.equal(store.data.adaptive.words.level, expected);
      if (expected !== level) assert.deepEqual(store.data.adaptive.words.recent, []);
    }
  });
}

test('Критерий двух ошибок в Словах не изменяет адаптацию Чисел', async () => {
  const data = defaults(); data.adaptive.numbers.level = 6;
  const store = new Store({ read: async () => data, write: async () => {} }); await store.load();
  for (let n = 0; n < 4; n++) {
    const attempt = new Attempt(`numbers-${n}`, GAMES.numbers.generate(6, () => 0), 'session-adaptive', GAMES.numbers);
    attempt.show(); attempt.recall(); await store.record(attempt.finish('110000000')!);
  }
  assert.equal(store.data.adaptive.numbers.level, 6);
});

test('Миграция настоящей структуры 0.1.0: сохраняются настройки, окна, уровни и история', async () => {
  const raw = JSON.parse(await readFile('tests/fixtures/data-v1.json', 'utf8'));
  const before = structuredClone(raw);
  let writes = 0; let persisted: unknown;
  const store = new Store({ read: async () => raw, write: async next => { writes++; persisted = structuredClone(next); } });
  await store.load();
  assert.equal(store.loadError, null); assert.equal(writes, 0, 'Миграция при чтении не перезаписывает файл');
  assert.deepEqual(raw, before);
  assert.equal(store.data.schemaVersion, 4);
  assert.equal(store.data.settings.minutes, raw.settings.minutes);
  assert.deepEqual(store.data.settings.enabled, raw.settings.enabled);
  for (const id of ['numbers', 'location', 'words', 'sequence'] as const) {
    assert.deepEqual(store.data.settings.practice[id], raw.settings.practice[id]);
    assert.deepEqual(store.data.adaptive[id], raw.adaptive[id]);
  }
  assert.deepEqual(store.data.history, raw.history.map((r: { game: string }) => ({ ...r, displayEnd: 'timer', day: null, dayGoal: null, goalVersion: 1, materialLanguage: r.game === 'words' ? 'ru' : null })));
  await store.settings(settings => { settings.minutes = 3; });
  assert.equal(writes, 1);
  const reopened = parseData(persisted);
  assert.equal(reopened.schemaVersion, 4); assert.equal(reopened.settings.minutes, 3);
  assert.deepEqual(reopened.history, store.data.history);
  for (const id of ['numbers', 'location', 'words', 'sequence'] as const) assert.deepEqual(reopened.adaptive[id], before.adaptive[id]);
});

test('Повреждённая v1, неполная v2 и неизвестная схема не проходят миграцию и не пишутся', async () => {
  const legacy = JSON.parse(await readFile('tests/fixtures/data-v1.json', 'utf8'));
  const badScore = structuredClone(legacy); badScore.history[0].correct = 100;
  const partial = { ...legacy, schemaVersion: 2 };
  const badEnd = parseData(legacy); (badEnd.history[0] as any).displayEnd = 'unknown';
  const sequenceReady = parseData(legacy); sequenceReady.history[3]!.displayEnd = 'ready';
  for (const raw of [badScore, partial, badEnd, sequenceReady, { ...legacy, schemaVersion: 999 }]) {
    const before = structuredClone(raw);
    const store = new Store({ read: async () => raw, write: async () => assert.fail('Нельзя перезаписывать повреждённые данные') });
    await store.load(); assert.ok(store.loadError);
    await assert.rejects(store.setAdaptiveLevel('words', 4));
    assert.equal(store.configurationBusy, false); assert.deepEqual(raw, before);
  }
});

test('Запомнил и таймер делят один переход; сохраняются реальное время и первые условия', () => {
  for (const game of ['numbers', 'words', 'location'] as const) {
    for (const first of ['ready', 'timer'] as const) {
      let clock = 0;
      const challenge = GAMES[game].generate(1, () => 0);
      const attempt = new Attempt(`early-${game}-${first}`, challenge, 'session-adaptive', GAMES[game], () => clock);
      attempt.show(); clock = first === 'ready' ? 1250 : challenge.params.showMs;
      assert.equal(attempt.recall(first), true);
      assert.equal(attempt.recall(first === 'ready' ? 'timer' : 'ready'), false);
      const shown = clock; clock += 900;
      const answer = challenge.game === 'numbers' ? challenge.digits : challenge.game === 'words' ? challenge.words
        : challenge.game === 'location' ? challenge.objects[challenge.target]!.cell : [];
      const record = attempt.finish(answer)!;
      assert.equal(record.displayMs, shown); assert.equal(record.responseMs, 900); assert.equal(record.displayEnd, first);
      assert.equal(attempt.finish(answer), null);
    }
  }
  const sequence = new Attempt('full-demo', GAMES.sequence.generate(1), 'session-adaptive', GAMES.sequence);
  sequence.show(); assert.equal(sequence.recall('ready'), false); assert.equal(sequence.phase, 'show');
  assert.equal(sequence.recall('timer'), true);
});

test('Рекорды: v1 объединяется с таймером, ранний показ отделён без групп на миллисекунды', async () => {
  const legacy = parseData(JSON.parse(await readFile('tests/fixtures/data-v1.json', 'utf8'))).history[0]!;
  const timer = { ...legacy, id: 'new-timer', responseMs: 1500, displayMs: legacy.displayMs + 10 };
  const ready = { ...legacy, id: 'ready', displayEnd: 'ready' as const, displayMs: 1000, responseMs: 300 };
  const readyAgain = { ...ready, id: 'ready2', displayMs: 1234, responseMs: 400 };
  const history = [legacy, timer, ready, readyAgain];
  assert.deepEqual(comparison(history, timer).recent.map(r => r.id), [legacy.id, timer.id]);
  assert.equal(comparison(history, timer).bestMs, 1500);
  assert.deepEqual(comparison(history, ready).recent.map(r => r.id), ['ready', 'ready2']);
  assert.equal(comparison(history, ready).bestMs, 300);
});

test('Выбор автоуровня: новая отправная точка, пустое окно и независимость ручного режима', async () => {
  for (const game of GAME_IDS) {
    const data = defaults(); data.adaptive[game] = { level: 2, recent: [0, 0, 0] };
    data.settings.practice[game] = { level: 2, manual: true };
    const store = new Store({ read: async () => data, write: async () => {} }); await store.load();
    await store.setAdaptiveLevel(game, 3);
    const expected = structuredClone(data); expected.adaptive[game] = { level: 3, recent: [] };
    assert.deepEqual(store.data, expected);
    const challenge = GAMES[game].generate(3, () => 0);
    const attempt = new Attempt('after-choice', challenge, 'session-adaptive', GAMES[game]);
    const answer = challenge.game === 'numbers' ? challenge.digits : challenge.game === 'words' ? challenge.words
      : challenge.game === 'location' ? challenge.objects[challenge.target]!.cell : challenge.game === 'sequence' ? challenge.steps : challenge.game === 'rule' ? challenge.answer : challenge.solution[challenge.position]!;
    attempt.show(); attempt.recall(); await store.record(attempt.finish(answer)!);
    assert.equal(store.data.adaptive[game].level, 3); assert.deepEqual(store.data.adaptive[game].recent, [1]);
    const before = structuredClone(store.data);
    await assert.rejects(store.setAdaptiveLevel(game, 0)); await assert.rejects(store.setAdaptiveLevel(game, GAMES[game].maxLevel + 1));
    assert.deepEqual(store.data, before);
  }
});
