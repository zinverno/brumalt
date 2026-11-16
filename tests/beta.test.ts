import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateRule, ruleClass, solveRule, figureKey } from '../src/games/rule';
import { generateOrder, solveOrder, satisfies, permutations } from '../src/games/order';
import { GAMES } from '../src/games';
import { MAX_LEVEL } from '../src/core/config';
import { adapt } from '../src/core/adaptation';
import { amount } from '../src/core/language';
import { Attempt } from '../src/core/attempt';
import { defaults, parseData, Store } from '../src/core/storage';
import { goalForDay, localDay, reminderDelay, shiftDay, today, week } from '../src/core/daily';
import { Reminders } from '../src/core/reminders';
import { GAME_IDS, isLogic, type AttemptRecord, type SavedData } from '../src/core/types';
import { planSession } from '../src/core/session';

function seeded(seed: number) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; }; }
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };
const at = (day: string, time = '12:00') => new Date(`${day}T${time}:00`);
function result(id: string, day: string, correct = true, goal: 3 | 6 | 9 | 12 | null = 6): AttemptRecord {
  const attempt = new Attempt(id, GAMES.numbers.generate(1, () => 0), 'session-adaptive', GAMES.numbers);
  attempt.show(); attempt.recall(); return attempt.finish(correct ? '0000' : '1111', at(day).toISOString(), goal)!;
}
function wordResult(id: string, day: string): AttemptRecord {
  const c = GAMES.words.generate(1, () => 0); if (c.game !== 'words') throw new Error('game');
  const attempt = new Attempt(id, c, 'session-adaptive', GAMES.words);
  attempt.show(); attempt.recall(); return attempt.finish(c.words, at(day).toISOString(), 6)!;
}
function memoryPort(initial: unknown = defaults(at('2026-11-15'))) {
  let disk = structuredClone(initial); let fail = false; let gate: Promise<void> | null = null; let writes = 0;
  const port = { read: async () => structuredClone(disk), write: async (data: SavedData) => {
    writes++; if (gate) await gate; if (fail) throw new Error('disk'); disk = structuredClone(data);
  } };
  return { port, get disk() { return disk; }, get writes() { return writes; }, fail: (value: boolean) => { fail = value; }, gate: (value: Promise<void> | null) => { gate = value; } };
}

test('Правило: 4000 фиксированных заданий, независимый перебор допустимого класса и все варианты', () => {
  for (let level = 1; level <= 4; level++) {
    const random = seeded(6700 + level);
    for (let n = 0; n < 1000; n++) {
      const c = generateRule(level, random);
      assert.equal(new Set(c.options.map(figureKey)).size, 4);
      // An independent oracle uses direct feature comparisons, not applyRule or solveRule.
      const valid = ruleClass(level).filter(r => c.examples.every(e =>
        (e.after.direction - e.before.direction + 4) % 4 === r.rotation &&
        (e.after.position - e.before.position + 4) % 4 === r.movement &&
        (e.after.filled !== e.before.filled) === r.flip));
      assert.ok(valid.length);
      const answers = new Set(valid.map(r => c.options.findIndex(f =>
        (f.direction - c.question.direction + 4) % 4 === r.rotation &&
        (f.position - c.question.position + 4) % 4 === r.movement &&
        (f.filled !== c.question.filled) === r.flip)));
      assert.deepEqual([...answers], [c.answer]); assert.equal(solveRule(c), c.answer);
      c.options.forEach((_, answer) => assert.deepEqual(GAMES.rule.evaluate(c, answer), { correct: Number(answer === c.answer), total: 1 }));
      assert.equal(GAMES.rule.evaluate(c, 4), null); assert.equal(GAMES.rule.evaluate(c, '0'), null);
      if (level === 4) assert.equal(Number(!!c.rule.rotation) + Number(!!c.rule.movement) + Number(c.rule.flip), 2);
    }
    const fallback = generateRule(level, seeded(1), 0);
    assert.equal(solveRule(fallback), fallback.answer);
  }
  const c = generateRule(4, seeded(7));
  assert.equal(solveRule({ ...c, examples: [] }), null);
  assert.equal(solveRule({ ...c, options: Array(4).fill(c.options[0]) }), null);
});

test('Порядок: 4000 задач с фиксированными seed, единственная расстановка и независимый оракул', () => {
  for (let level = 1; level <= 4; level++) {
    const random = seeded(8700 + level);
    for (let n = 0; n < 1000; n++) {
      const c = generateOrder(level, random);
      const valid = permutations(c.objects).filter(order => c.clues.every(clue => {
        const index = order.indexOf(clue.a);
        if (clue.kind === 'notEdge') return order[0] !== clue.a && order.at(-1) !== clue.a;
        const other = order.indexOf(clue.b);
        return clue.kind === 'left' ? index < other : clue.kind === 'right' ? index > other : order[other + 1] === clue.a;
      }));
      assert.deepEqual(valid, [c.solution]); assert.deepEqual(solveOrder(c), valid);
      assert.ok(c.position > 0 && c.position < c.objects.length - 1);
      assert.ok(c.objects.length !== 3 || c.clues.every(clue => clue.kind !== 'notEdge'), 'Нет буквально сообщённого среднего объекта');
      c.objects.forEach(answer => assert.deepEqual(GAMES.order.evaluate(c, answer), { correct: Number(answer === c.solution[c.position]), total: 1 }));
      assert.equal(GAMES.order.evaluate(c, -1), null);
    }
    const fallback = generateOrder(level, seeded(1), 0); assert.deepEqual(solveOrder(fallback), [fallback.solution]);
  }
  assert.equal(satisfies([0, 1, 2], { kind: 'right', a: 2, b: 0 }), true);
  assert.equal(satisfies([0, 1, 2], { kind: 'nextRight', a: 2, b: 0 }), false);
  assert.equal(solveOrder({ objects: [0, 1, 2], clues: [] }).length, 6);
  assert.equal(solveOrder({ objects: [0, 1, 2], clues: [{ kind: 'left', a: 0, b: 1 }, { kind: 'right', a: 0, b: 1 }] }).length, 0);
});

test('Бинарная адаптация логики достижима на всех уровнях и устойчива к одной ошибке', () => {
  for (const game of ['rule', 'order'] as const) for (let level = 1; level <= MAX_LEVEL[game]; level++) {
    for (const successes of [[1, 1, 1, 1], [0, 0, 1, 0], [1, 0, 1, 1]]) {
      let state = { level, recent: [] as number[] };
      for (const [i, success] of successes.entries()) {
        const c = GAMES[game].generate(level, seeded(i));
        const answer = c.game === 'rule' ? (c.answer + (success ? 0 : 1)) % 4
          : c.game === 'order' ? success ? c.solution[c.position]! : c.objects.find(id => id !== c.solution[c.position])! : -1;
        const score = GAMES[game].evaluate(c, answer)!; assert.equal(score.correct, success);
        state = adapt(state, score.correct / score.total, MAX_LEVEL[game], game);
        if (i < 3) assert.equal(state.level, level);
      }
      assert.equal(state.level, successes.every(Boolean) ? Math.min(4, level + 1) : successes.filter(n => !n).length === 3 ? Math.max(1, level - 1) : level);
    }
  }
});

test('Смешанные планы для всех подмножеств игр: память и логика, уникальность, одна дисциплина', () => {
  for (let mask = 1; mask < 64; mask++) {
    const enabled = GAME_IDS.filter((_, i) => mask & (1 << i));
    for (const minutes of [1, 3, 5] as const) for (let seed = 0; seed < 10; seed++) {
      const plan = planSession(enabled, minutes, [], seeded(seed));
      assert.equal(new Set(plan).size, plan.length); assert.ok(plan.every(id => enabled.includes(id)));
      if (minutes > 1 && enabled.some(isLogic) && enabled.some(id => !isLogic(id))) {
        assert.ok(plan.some(isLogic)); assert.ok(plan.some(id => !isLogic(id)));
      }
    }
  }
});

test('Дневной учёт: неудачный ответ считается, отмена нет, ошибка записи атомарна, retry после полуночи', async () => {
  const disk = memoryPort(); const store = new Store(disk.port); await store.load();
  const aborted = new Attempt('abort', GAMES.numbers.generate(1), 'session-adaptive', GAMES.numbers);
  aborted.show(); aborted.interrupt(); assert.equal(aborted.finish('0000'), null);
  const record = result('late', '2026-11-15', false);
  disk.fail(true); const before = structuredClone(store.data); await assert.rejects(store.record(record)); assert.deepEqual(store.data, before);
  disk.fail(false);
  await Promise.all([store.record(record), store.record(record)]);
  assert.deepEqual(store.data.daily.days, [{ day: '2026-11-15', goal: 6, count: 1, reminded: false, points: 2, byGame: { numbers: 1 }, legacy: null }]);
  assert.deepEqual(store.data.adaptive.numbers.recent, [0]);
  await store.record(result('tomorrow', '2026-11-16'));
  await store.record(record); assert.equal(today(store.data, at('2026-11-15')).count, 1);
  const restarted = new Store(disk.port); await restarted.load(); await restarted.record(record);
  assert.equal(today(restarted.data, at('2026-11-16')).count, 1); assert.equal(restarted.data.history.length, 2);
});

test('Цель меняется завтра; отключение действует сейчас; записанный день сохраняет свою цель', async () => {
  const store = new Store(memoryPort().port); await store.load();
  await store.record(result('today', '2026-11-15'));
  await store.setGoal(9, at('2026-11-15'));
  assert.equal(today(store.data, at('2026-11-15')).goal, 6); assert.equal(goalForDay(store.data, '2026-11-16'), 9);
  await store.record(result('future', '2026-11-16', true, 9));
  await store.setGoal(12, at('2026-11-15')); // Clock moved back; an already recorded day's conditions are frozen.
  assert.equal(goalForDay(store.data, '2026-11-16'), 9);
  await store.setReminder(true); await store.setGoal(null, at('2026-11-15'));
  assert.equal(today(store.data, at('2026-11-15')).goal, null); assert.equal(store.data.settings.reminder.enabled, false);
  await store.setGoal(6, at('2026-11-15')); assert.equal(today(store.data, at('2026-11-15')).goal, null);
});

test('Локальная дата, часовой пояс и перевод часов не пересчитывают сохранённые дни', async () => {
  const original = process.env.TZ;
  try {
    process.env.TZ = 'Pacific/Kiritimati';
    const record = result('timezone', '2026-11-16');
    assert.equal(record.day, '2026-11-16'); assert.ok(record.at.startsWith('2026-11-15'));
    const disk = memoryPort(); const store = new Store(disk.port); await store.load(); await store.record(record);
    process.env.TZ = 'America/Los_Angeles';
    const restarted = new Store(disk.port); await restarted.load(); await restarted.record(record);
    assert.equal(restarted.data.daily.days[0]!.day, '2026-11-16'); assert.equal(restarted.data.daily.days[0]!.count, 1);
    assert.equal(localDay(new Date('2026-11-16T02:00:00Z')), '2026-11-15');
    assert.equal(shiftDay('2026-03-08', 1), '2026-03-09');
    await restarted.record(result('clock-back', '2026-11-14'));
    assert.equal(restarted.data.daily.days.find(d => d.day === '2026-11-16')!.count, 1);
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
});

test('Агрегаты независимы от 1000 попыток, ограничены 365 днями; повтор старого ID в текущем запуске безопасен', async () => {
  const store = new Store(memoryPort().port); await store.load();
  const first = result('first', '2026-11-15'); await store.record(first);
  for (let i = 0; i < 1001; i++) await store.record(result(`many-${i}`, '2026-11-15'));
  assert.equal(store.data.history.length, 1000); assert.equal(today(store.data, at('2026-11-15')).count, 1002);
  await store.record(first); assert.equal(today(store.data, at('2026-11-15')).count, 1002);
  for (let i = 1; i <= 370; i++) await store.record(result(`day-${i}`, shiftDay('2026-11-15', i)));
  assert.equal(store.data.daily.days.length, 365); assert.equal(store.data.daily.days[0]!.day, shiftDay('2026-11-15', 6));
});

test('Миграция v1/v2 сохраняет настройки/историю; новые дни не выдумываются, испорченные агрегаты блокируются', async () => {
  for (const version of [1, 2]) {
    const raw = JSON.parse(await readFile(`tests/fixtures/data-v${version}.json`, 'utf8'));
    const data = parseData(raw, at('2026-11-15'));
    assert.equal(data.schemaVersion, 4); assert.deepEqual(data.daily.days, []);
    assert.equal(data.settings.reminder.enabled, false); assert.deepEqual(data.settings.enabled, raw.settings.enabled);
    for (const id of ['numbers', 'location', 'words', 'sequence'] as const) {
      assert.deepEqual(data.adaptive[id], raw.adaptive[id]); assert.deepEqual(data.settings.practice[id], raw.settings.practice[id]);
    }
    assert.deepEqual(data.history, raw.history.map((r: { game: string }) => ({ ...r, displayEnd: 'timer', day: null, dayGoal: null, goalVersion: 1, materialLanguage: r.game === 'words' ? 'ru' : null })));
    assert.deepEqual(data.adaptive.rule, { level: 1, recent: [] });
    assert.ok(week(data, at('2026-11-15')).slice(0, 6).every(d => d.status === 'unknown'));
    assert.deepEqual(parseData(JSON.parse(JSON.stringify(data))), data);
    const bad = structuredClone(data); bad.daily.days = [{ day: '2026-02-30', goal: 6, count: 1, reminded: false, points: 2, byGame: { numbers: 1 }, legacy: null }];
    assert.throws(() => parseData(bad));
    const port = memoryPort(bad); const store = new Store(port.port); await store.load(); await assert.rejects(store.record(result('no', '2026-11-15'))); assert.equal(port.writes, 0);
  }
});

async function remindersFixture() {
  const disk = memoryPort(); const store = new Store(disk.port); await store.load(); await store.setReminder(true);
  let now = at('2026-11-15', '17:59'); let available = true; let shown = 0; let errors = 0;
  let serial = 0; const timers = new Map<number, { fn: () => void; delay: number }>();
  const host = { now: () => now, available: () => available,
    setTimer: (fn: () => void, delay: number) => { timers.set(++serial, { fn, delay }); return serial; },
    clearTimer: (id: number) => { timers.delete(id); }, show: () => { shown++; }, changed() {}, failed: () => { errors++; } };
  const runner = new Reminders(store, host);
  return { disk, store, runner, host, timers, date: (date: Date) => { now = date; }, available: (value: boolean) => { available = value; }, get shown() { return shown; }, get errors() { return errors; } };
}

test('Напоминание: время, фокус, гонки, один показ в день, перезапуск и новая дата', async () => {
  const f = await remindersFixture(); f.runner.wake(); await flush(); assert.equal(f.shown, 0); assert.equal(f.timers.size, 1);
  f.date(at('2026-11-15', '18:01')); f.available(false); f.runner.wake(); await flush(); assert.equal(f.shown, 0);
  f.available(true); for (let i = 0; i < 5; i++) f.runner.wake(); await flush(); assert.equal(f.shown, 1);
  f.runner.wake(); await flush(); assert.equal(f.shown, 1); f.runner.stop(); assert.equal(f.timers.size, 0);
  const restarted = new Store(f.disk.port); await restarted.load(); const runner = new Reminders(restarted, f.host);
  runner.wake(); await flush(); assert.equal(f.shown, 1);
  f.date(at('2026-11-16', '17:00')); runner.wake(); await flush(); assert.equal(f.shown, 1);
  f.date(at('2026-11-16', '18:00')); runner.wake(); await flush(); assert.equal(f.shown, 2);
  f.date(at('2026-11-15', '19:00')); runner.wake(); await flush(); assert.equal(f.shown, 2); runner.stop();
});

test('Напоминание: завершённая цель, выключение, игра во время записи и ошибка диска', async () => {
  const f = await remindersFixture(); f.date(at('2026-11-15', '19:00'));
  let release!: () => void; f.disk.gate(new Promise<void>(resolve => { release = resolve; }));
  f.runner.wake(); await flush(); f.available(false); release(); await flush(); assert.equal(f.shown, 0);
  assert.equal(f.store.data.daily.days[0]!.reminded, false);
  f.disk.gate(null); f.available(true); f.disk.fail(true); f.runner.wake(); await flush(); assert.equal(f.errors, 1); assert.equal(f.shown, 0);
  f.disk.fail(false);
  for (let i = 0; i < 2; i++) {
    await f.store.record(result(`complete-${i}`, '2026-11-15', false));
    await f.store.record(wordResult(`words-${i}`, '2026-11-15'));
  }
  f.runner.wake(); await flush(); assert.equal(f.shown, 0);
  await f.store.setReminder(false); f.runner.stop(); assert.equal(f.timers.size, 0);
  f.date(at('2026-11-16', '20:00')); f.runner.wake(); await flush(); assert.equal(f.shown, 0);
});

test('Напоминание: отключение при ожидающей записи не показывает Notice; таймер следует местному календарю', async () => {
  const f = await remindersFixture(); f.date(at('2026-11-15', '19:00'));
  let release!: () => void; f.disk.gate(new Promise<void>(resolve => { release = resolve; }));
  f.runner.wake(); await flush(); f.runner.stop(); const disabled = f.store.setReminder(false); release(); await disabled; await flush();
  assert.equal(f.shown, 0); assert.equal(f.timers.size, 0); assert.equal(f.store.data.settings.reminder.enabled, false);
  assert.equal(reminderDelay(f.store.data, at('2026-11-15', '17:59')), 60000);
  assert.equal(reminderDelay(f.store.data, at('2026-11-15', '23:59')), 60000);
});

test('Русские формы чисел, включая 11–14 и составные числа', () => {
  for (const [n, expected] of [[1, '1 попытка'], [2, '2 попытки'], [5, '5 попыток'], [11, '11 попыток'], [12, '12 попыток'], [14, '14 попыток'], [21, '21 попытка'], [23, '23 попытки'], [111, '111 попыток']] as const)
    assert.equal(amount(n, 'попытка', 'попытки', 'попыток'), expected);
});

test('Напоминание не обгоняет сохранение последней попытки цели', async () => {
  const f = await remindersFixture(); f.date(at('2026-11-15', '19:00'));
  for (let i = 0; i < 5; i++) await f.store.record(result(`before-${i}`, '2026-11-15'));
  await f.store.record(wordResult('words-first', '2026-11-15'));
  assert.equal(today(f.store.data, at('2026-11-15')).points, 5);
  let release!: () => void; f.disk.gate(new Promise<void>(resolve => { release = resolve; }));
  const completion = f.store.record(wordResult('last', '2026-11-15'));
  f.runner.wake(); f.runner.wake(); release(); await completion; await flush();
  assert.equal(f.shown, 0); assert.equal(today(f.store.data, at('2026-11-15')).complete, true); f.runner.stop();
});

test('Перевод часов назад во время записи отменяет преждевременный показ', async () => {
  const f = await remindersFixture(); f.date(at('2026-11-15', '18:00'));
  let release!: () => void; f.disk.gate(new Promise<void>(resolve => { release = resolve; }));
  f.runner.wake(); await flush(); f.date(at('2026-11-15', '17:30')); release(); await flush();
  assert.equal(f.shown, 0); assert.equal(f.store.data.daily.days[0]!.reminded, false); f.runner.stop();
});
