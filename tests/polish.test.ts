import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { count, dictionaries, resolveLanguage, t, type Key, type Language } from '../src/i18n';
import { Store, defaults, parseData } from '../src/core/storage';
import { Attempt } from '../src/core/attempt';
import { goalForDay, nextPoints, today, week } from '../src/core/daily';
import { comparison } from '../src/core/statistics';
import { GAMES } from '../src/games';
import { ENGLISH_WORDS, WORDS } from '../src/games/words';
import type { Answer, GameId, Goal, SavedData } from '../src/core/types';

const now = new Date('2026-11-15T23:59:00');
function result(id: string, game: GameId, day = '2026-11-15', goal: Goal = 6, language: Language = 'en', correct = true) {
  const c = GAMES[game].generate(1, () => 0, language);
  const answer: Answer = c.game === 'numbers' ? correct ? c.digits : '9999' : c.game === 'words' ? c.words : c.game === 'sequence' ? c.steps : c.game === 'location' ? c.objects[c.target]!.cell : c.game === 'rule' ? c.answer : c.solution[c.position]!;
  const a = new Attempt(id, c, 'session-adaptive', GAMES[game]); a.show(); a.recall();
  return a.finish(answer, new Date(day + 'T23:59:00').toISOString(), goal)!;
}
async function memory(initial: unknown = defaults(now)) {
  let disk = structuredClone(initial); let fail = false; let gate: Promise<void> | undefined;
  const port = { read: async () => structuredClone(disk), write: async (data: SavedData) => { await gate; if (fail) throw new Error('disk'); disk = structuredClone(data); } };
  const store = new Store(port); await store.load();
  return { store, port, disk: () => disk, fail: (value: boolean) => { fail = value; }, delay: (value?: Promise<void>) => { gate = value; } };
}

test('i18n: explicit > host > environment > English; both dictionaries have matching keys and placeholders', () => {
  for (const [setting, host, environment, expected] of [
    ['en', 'ru', 'ru-RU', 'en'], ['ru', 'en', 'en-US', 'ru'], ['auto', 'ru', 'en', 'ru'],
    ['auto', 'en', 'ru', 'en'], ['auto', 'de', 'ru', 'en'], ['auto', '', 'ru-RU', 'ru'],
    ['auto', undefined, 'RU_ru', 'ru'], ['auto', undefined, undefined, 'en'],
  ] as const) assert.equal(resolveLanguage(setting, host, environment), expected);
  assert.deepEqual(Object.keys(dictionaries.en).sort(), Object.keys(dictionaries.ru).sort());
  for (const key of Object.keys(dictionaries.en) as Key[]) {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    assert.deepEqual(placeholders(dictionaries.en[key]), placeholders(dictionaries.ru[key]), key);
    assert.ok(dictionaries.ru[key].length);
    if (key !== 'russian') assert.doesNotMatch(dictionaries.en[key], /[А-Яа-яЁё]/); // Language names use their own script.
  }
  assert.equal(t('en', 'dayDetails', { date: 'Sunday', status: 'Goal complete', points: 6, goal: 6, attempts: '4 attempts' }), 'Sunday · Goal complete\n6 / 6 points · 4 attempts');
  assert.match(t('ru', 'reminder', { points: count('ru', 4, 'point') }), /4 балла/);
});

test('i18n: Russian 1, 2–4, 5, 11–14, 21; English singular/plural for every unit', () => {
  for (const unit of ['attempt', 'point', 'digit', 'digitAcc', 'word', 'step', 'item', 'shape', 'game'] as const) {
    assert.notEqual(count('en', 1, unit).slice(2), count('en', 2, unit).slice(2));
    assert.equal(count('ru', 11, unit).slice(3), count('ru', 14, unit).slice(3));
    assert.equal(count('ru', 21, unit).slice(3), count('ru', 1, unit).slice(2));
  }
  for (const [n, expected] of [[1, '1 попытка'], [2, '2 попытки'], [5, '5 попыток'], [11, '11 попыток'], [12, '12 попыток'], [13, '13 попыток'], [14, '14 попыток'], [21, '21 попытка']] as const) assert.equal(count('ru', n, 'attempt'), expected);
  assert.equal(count('ru', 4, 'digit'), '4 цифры'); assert.equal(count('ru', 5, 'digit'), '5 цифр');
  assert.equal(count('ru', 3, 'step'), '3 шага'); assert.equal(count('ru', 5, 'step'), '5 шагов');
  assert.equal(count('en', 1, 'point'), '1 point'); assert.equal(count('en', 2, 'point'), '2 points');
});

test('Points: legal wrong answers earn 2 / 1 / 0, other games add points, one game cannot meet any offered goal', async () => {
  for (const target of [6, 9, 12] as const) {
    const data = defaults(now); data.settings.goal = target; data.daily.schedule[0]!.goal = target;
    const { store } = await memory(data);
    for (let i = 0; i < 12; i++) {
      assert.equal(nextPoints(store.data.daily.days[0], 'numbers'), i === 0 ? 2 : i === 1 ? 1 : 0);
      await store.record(result(`n${i}`, 'numbers', undefined, target, 'en', false));
      assert.equal(today(store.data, now).points, i === 0 ? 2 : 3);
      assert.equal(today(store.data, now).complete, false);
    }
    await store.record(result('word1', 'words', undefined, target)); assert.equal(today(store.data, now).points, 5);
    await store.record(result('word2', 'words', undefined, target)); assert.equal(today(store.data, now).points, 6);
    assert.equal(today(store.data, now).complete, target === 6);
    assert.equal(today(store.data, now).count, 14); assert.equal(store.data.history.length, 14);
    assert.equal(week(store.data, now)[6]!.status, target === 6 ? 'complete' : 'partial');
    assert.equal(week(store.data, now)[6]!.points, 6);
    await assert.rejects(store.setGoal(3, now));
  }
});

test('Points: delayed save is atomic, retry after midnight uses the captured date, duplicate/restart/abort add nothing', async () => {
  const f = await memory(); const before = structuredClone(f.store.data);
  const aborted = new Attempt('aborted', GAMES.words.generate(1), 'session-adaptive', GAMES.words);
  aborted.show(); aborted.interrupt(); assert.equal(aborted.finish([]), null); assert.deepEqual(f.store.data, before);
  const record = result('late', 'numbers', undefined, 6, 'en', false);
  let release!: () => void; f.delay(new Promise<void>(done => { release = done; }));
  f.fail(true); const write = f.store.record(record); assert.deepEqual(f.store.data, before); release();
  await assert.rejects(write); assert.deepEqual(f.store.data, before); assert.deepEqual(f.disk(), before);
  f.fail(false); f.delay();
  await Promise.all([f.store.record(record), f.store.record(record)]);
  await f.store.record(result('new-day', 'numbers', '2026-11-16'));
  const restarted = new Store(f.port); await restarted.load(); await restarted.record(record);
  assert.equal(today(restarted.data, now).points, 2); assert.equal(today(restarted.data, new Date('2026-11-16T00:01:00')).points, 2);
  assert.equal(restarted.data.history.length, 2); assert.deepEqual(restarted.data.adaptive.numbers.recent, [0, 1]);
  assert.equal(restarted.data.daily.days[0]!.count, 1);
});

test('Points target changes tomorrow, goals off immediately, empty week days keep their scheduled target', async () => {
  const { store } = await memory();
  assert.equal(week(store.data, now)[6]!.status, 'empty'); assert.equal(week(store.data, now)[6]!.goal, 6);
  await store.setGoal(12, now); assert.equal(today(store.data, now).goal, 6); assert.equal(goalForDay(store.data, '2026-11-16'), 12);
  await store.record(result('n', 'numbers')); assert.equal(today(store.data, now).points, 2);
  await store.setGoal(null, now); assert.equal(today(store.data, now).goal, null);
  await store.record(result('n2', 'numbers', undefined, null)); assert.equal(today(store.data, now).points, 3);
  await store.setGoal(9, now); assert.equal(today(store.data, now).goal, null); assert.equal(goalForDay(store.data, '2026-11-16'), 9);
  await store.record(result('next', 'numbers', '2026-11-16', 9)); assert.equal(today(store.data, new Date('2026-11-16T12:00:00')).points, 2);
});

test('0.2.0 migration preserves all attempts and legacy targets; only complete daily history yields exact points', async () => {
  const raw = JSON.parse(await readFile('tests/fixtures/data-v3.json', 'utf8')); const original = structuredClone(raw);
  const f = await memory(raw); const data = f.store.data;
  assert.equal(data.schemaVersion, 4); assert.equal(data.settings.language, 'auto'); assert.equal(data.settings.goal, 6);
  assert.deepEqual(data.adaptive, raw.adaptive); assert.deepEqual(data.settings.practice, raw.settings.practice);
  assert.deepEqual(data.settings.reminder, raw.settings.reminder); assert.equal(data.settings.minutes, raw.settings.minutes);
  assert.deepEqual(data.settings.enabled, raw.settings.enabled); assert.equal(data.history.length, raw.history.length);
  for (let i = 0; i < raw.history.length; i++) {
    const { goalVersion, materialLanguage, ...kept } = data.history[i]!;
    assert.deepEqual(kept, raw.history[i]); assert.equal(goalVersion, 1); assert.equal(materialLanguage, kept.game === 'words' ? 'ru' : null);
  }
  const [unknown, exact] = data.daily.days;
  assert.deepEqual(unknown!.legacy, { count: 8, goal: 3, credited: false }); assert.equal(unknown!.points, 0);
  assert.deepEqual(exact!.legacy, { count: 3, goal: 3, credited: true }); assert.equal(exact!.points, 5);
  assert.deepEqual(week(data, now).slice(-2).map(day => day.status), ['legacy', 'legacy']);
  assert.deepEqual(parseData(data), data); assert.deepEqual(raw, original);
  await f.store.record(result('after-upgrade', 'words')); assert.equal(today(f.store.data, now).points, 6);
  assert.equal(week(f.store.data, now)[6]!.status, 'complete');
  await f.store.record(result('clock-back', 'numbers', '2026-11-14'));
  const oldDay = f.store.data.daily.days[0]!; assert.equal(oldDay.count, 9); assert.equal(oldDay.points, 2); assert.equal(oldDay.legacy!.count, 8);
  const restarted = new Store(f.port); await restarted.load(); assert.deepEqual(restarted.data, f.store.data);
});

test('Corrupt points, quotas, language and legacy metadata are rejected without any writes', async () => {
  const { store } = await memory(); await store.record(result('n', 'numbers'));
  for (const mutate of [
    (data: any) => { data.settings.language = 'xx'; },
    (data: any) => { data.settings.language = ['en']; },
    (data: any) => { data.daily.days[0].count = 3; },
    (data: any) => { data.settings.goal = 3; },
    (data: any) => { data.daily.days[0].points = 6; },
    (data: any) => { data.daily.days[0].byGame.numbers = 3; },
    (data: any) => { data.daily.days[0].byGame.other = 1; },
    (data: any) => { data.daily.days[0].legacy = { count: 100, goal: 6, credited: true }; },
    (data: any) => { delete data.history[0].materialLanguage; },
  ]) {
    const raw = structuredClone(store.data); mutate(raw); const before = structuredClone(raw);
    const broken = new Store({ read: async () => raw, write: async () => assert.fail('Corrupt data must stay untouched') });
    await broken.load(); assert.equal(broken.loadError, 'loadFailed'); await assert.rejects(broken.settings(s => { s.language = 'en'; })); assert.deepEqual(raw, before);
  }
});

test('Words: both local word banks generate valid tasks at all levels; records compare within the material language', () => {
  for (const [language, bank] of [['en', ENGLISH_WORDS], ['ru', WORDS]] as const) {
    assert.equal(new Set(bank).size, bank.length); assert.ok(bank.length >= 60);
    for (let level = 1; level <= GAMES.words.maxLevel; level++) {
      const c = GAMES.words.generate(level, () => .25, language); if (c.game !== 'words') assert.fail();
      assert.equal(c.language, language); assert.equal(new Set(c.options).size, c.options.length);
      assert.ok(c.options.every(word => (bank as readonly string[]).includes(word)));
      assert.deepEqual(GAMES.words.evaluate(c, [...c.words].reverse()), { correct: c.params.count, total: c.params.count });
    }
  }
  const ru = result('ru', 'words', undefined, 6, 'ru'); const en = result('en', 'words');
  assert.deepEqual(comparison([ru, en], ru).recent, [ru]); assert.deepEqual(comparison([ru, en], en).recent, [en]);
});


test('0.3.2 copy: Single game naming throughout dictionaries and exact Russian point forms', () => {
  for (const language of ['en', 'ru'] as const) {
    assert.doesNotMatch(Object.values(dictionaries[language]).join(' '), /free play|free ·|свободная игра|свободно ·/i);
    assert.equal(t(language, 'free'), language === 'en' ? 'Single game' : 'Отдельная игра');
    assert.equal(t(language, 'todayProgress', { points: 2, goal: 6 }), language === 'en' ? 'Today: 2 / 6 points' : 'Сегодня: 2 / 6 баллов');
  }
  for (const [n, word] of [[1, 'балл'], [2, 'балла'], [3, 'балла'], [4, 'балла'], [5, 'баллов'], [11, 'баллов'], [12, 'баллов'], [13, 'баллов'], [14, 'баллов'], [21, 'балл'], [22, 'балла'], [25, 'баллов']] as const) {
    assert.equal(count('ru', n, 'point'), `${n} ${word}`);
    assert.ok(t('ru', 'reminder', { points: count('ru', n, 'point') }).includes(`${n} ${word}`));
  }
});
