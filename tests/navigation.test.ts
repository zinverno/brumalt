import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Navigation, type NavigationEvent } from '../src/ui/navigation';
import { exerciseProfile } from '../src/core/statistics';
import { parseData } from '../src/core/storage';
import { parameters } from '../src/core/config';
import { GAME_IDS, type AttemptRecord, type GameId } from '../src/core/types';

function result(id: string, game: GameId = 'numbers', extra: Partial<AttemptRecord> = {}): AttemptRecord {
  const params = parameters(game, 1);
  const total = game === 'location' || game === 'rule' || game === 'order' ? 1 : params.count;
  return { id, game, at: '2026-11-15T12:00:00.000Z', day: '2026-11-15', dayGoal: 6, goalVersion: 2,
    rulesVersion: 1, materialLanguage: game === 'words' ? 'en' : null, mode: 'session-adaptive',
    level: 1, params, elementCount: params.count, displayEnd: game === 'rule' || game === 'order' ? 'visible' : 'timer',
    displayMs: params.showMs, responseMs: 1000, correct: total, total, ...extra };
}

test('Navigation: five explicit routes, rejected stale events and deterministic Home returns', () => {
  const nav = new Navigation(); assert.equal(nav.current, 'Home');
  assert.equal(nav.send('finish'), false); assert.equal(nav.current, 'Home');
  for (const path of [
    ['progress', 'home'], ['prepare', 'home'], ['prepare', 'start', 'home'],
    ['prepare', 'start', 'finish', 'home'], ['prepare', 'start', 'prepare', 'start', 'finish', 'prepare', 'home'],
  ] as NavigationEvent[][]) {
    for (const event of path) assert.equal(nav.send(event), true, event);
    assert.equal(nav.current, 'Home');
  }
  nav.send('prepare'); nav.send('start'); assert.equal(nav.send('progress'), false);
  assert.equal(nav.current, 'GameActive'); nav.send('finish'); assert.equal(nav.current, 'SessionResult');
  assert.equal(nav.send('start'), false); assert.equal(nav.current, 'SessionResult');
});

test('Profile: empty axes are missing, six games stay separate, smoothed values are bounded and rounded', () => {
  assert.deepEqual(exerciseProfile([]).map(entry => entry.score), GAME_IDS.map(() => null));
  for (const game of GAME_IDS) {
    const records: AttemptRecord[] = [];
    for (let i = 0; i < 100; i++) {
      const r = result(`${game}-${i}`, game); r.correct = i % (r.total + 1); records.push(r);
      const profile = exerciseProfile(records); const entry = profile.find(item => item.game === game)!;
      assert.equal(profile.length, 6); assert.ok(profile.filter(item => item.game !== game).every(item => item.score === null));
      assert.ok(entry.score! >= 0 && entry.score! <= 100); assert.equal(entry.score! % 5, 0);
      assert.equal(entry.stats!.recent.length, Math.min(10, records.length));
      const mean = (records.slice(-10).reduce((sum, item) => sum + item.correct / item.total, 0) + (10 - Math.min(i + 1, 10)) * .5) / 10;
      assert.equal(entry.score, Math.round(mean * 20) * 5);
    }
  }
});

test('Profile: one outlier shifts the same-conditions index by at most ten points; old trials leave the ten-attempt window', () => {
  for (let n = 1; n <= 10; n++) for (const correct of [0, 4]) {
    const history = Array.from({ length: n }, (_, i) => result(String(i), 'numbers', { correct }));
    const before = exerciseProfile(history)[0]!.score!;
    const after = exerciseProfile([...history, result('outlier', 'numbers', { correct: 4 - correct })])[0]!.score!;
    assert.ok(Math.abs(after - before) <= 10, `${before} -> ${after}`);
  }
  const current = Array.from({ length: 10 }, (_, i) => result(String(i)));
  assert.equal(exerciseProfile(current)[0]!.score, exerciseProfile([result('old', 'numbers', { correct: 0 }), ...current])[0]!.score);
});

test('Profile: different levels, modes, display ending and Words languages never share a score or record', () => {
  const base = Array.from({ length: 8 }, (_, i) => result(String(i), 'words'));
  const params = parameters('words', 2);
  for (const extra of [
    { mode: 'free-manual' as const }, { displayEnd: 'ready' as const }, { materialLanguage: 'ru' as const },
    { level: 2, params, elementCount: params.count, total: params.count },
  ]) {
    const target = result('changed', 'words', { ...extra, correct: 0 });
    const entry = exerciseProfile([...base, target]).find(item => item.game === 'words')!;
    assert.deepEqual(entry.stats!.recent.map(record => record.id), ['changed']);
    assert.equal(entry.target, target); assert.equal(entry.score, 45); assert.equal(entry.stats!.bestMs, null);
  }
});

test('0.3.0 data remains schema 4; profiles and navigation do not mutate persisted settings, levels, history or points', async () => {
  const data = parseData(JSON.parse(await readFile('tests/fixtures/data-v3.json', 'utf8')));
  data.settings.language = 'en';
  const serialized = JSON.stringify(data); const reopened = parseData(JSON.parse(serialized));
  exerciseProfile(reopened.history);
  const nav = new Navigation(); nav.send('progress'); nav.send('home');
  assert.equal(reopened.schemaVersion, 4); assert.equal(JSON.stringify(reopened), serialized);
});
