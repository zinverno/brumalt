// Synthetic showcase material only; this module is never part of the plugin bundle.
import assert from 'node:assert/strict';
import { Attempt } from '../src/core/attempt';
import { defaults, parseData, Store } from '../src/core/storage';
import { localDay, shiftDay, today } from '../src/core/daily';
import { exerciseProfile } from '../src/core/statistics';
import { GAME_IDS, isLogic, type Answer, type AttemptRecord, type Challenge, type GameId } from '../src/core/types';
import { GAMES } from '../src/games';

const levels: Record<GameId, number> = { numbers: 3, location: 3, words: 2, sequence: 3, rule: 3, order: 3 };
const scores: Record<GameId, number[]> = {
  numbers: [6, 5, 6, 6, 4, 6, 5, 6, 6, 5],
  location: [1, 0, 1, 1, 0, 1, 0, 1, 0, 1],
  words: [5, 4, 3, 4, 5, 4, 3, 5, 4, 4],
  sequence: [5, 3, 2, 5, 1, 4, 3, 5, 2, 4],
  rule: [1, 1, 0, 1, 1, 1, 0, 1, 1, 1],
  order: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
};
function answer(c: Challenge, correct: number): Answer {
  switch (c.game) {
    case 'numbers': return [...c.digits].map((digit, i) => i < correct ? digit : String((Number(digit) + 1) % 10)).join('');
    case 'location': return (c.objects[c.target]!.cell + (correct ? 0 : 1)) % c.params.gridSize! ** 2;
    case 'words': return [...c.words.slice(0, correct), ...c.options.filter(word => !c.words.includes(word)).slice(0, c.params.count - correct)];
    case 'sequence': return correct === c.steps.length ? c.steps : [...c.steps.slice(0, correct), (c.steps[correct]! + 1) % 4];
    case 'rule': return (c.answer + (correct ? 0 : 1)) % 4;
    case 'order': return correct ? c.solution[c.position]! : c.objects.find(item => item !== c.solution[c.position])!;
  }
}

export async function showcaseData(now = new Date()) {
  const day = localDay(now);
  const initial = defaults(new Date(shiftDay(day, -7) + 'T12:00:00'));
  let saved = initial;
  const store = new Store({ read: async () => initial, write: async data => { saved = parseData(data); } });
  await store.load();
  await store.settings(settings => {
    settings.language = 'en';
    for (const game of GAME_IDS) settings.practice[game] = { manual: true, level: levels[game] };
  });
  for (const game of GAME_IDS) await store.setAdaptiveLevel(game, levels[game]);
  let seed = 3535;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const records: AttemptRecord[] = [];
  const tasks = Array.from({ length: 10 }, (_, i) => GAME_IDS.map(game => ({ game, i, current: false }))).flat();
  tasks.push({ game: 'numbers', i: 0, current: true }, { game: 'location', i: 0, current: true });
  for (const { game, i, current } of tasks) {
    const challenge = GAMES[game].generate(levels[game], random, 'en');
    let clock = 0;
    const attempt = new Attempt(`showcase-${game}-${current ? 'today' : i}`, challenge, 'free-manual', GAMES[game], () => clock);
    assert(attempt.show());
    if (!isLogic(game)) { clock += challenge.params.showMs; assert(attempt.recall()); }
    clock += 2800 + i * 370 + GAME_IDS.indexOf(game) * 150;
    const at = current ? now : new Date(shiftDay(day, -7 + Math.floor(i * 6 / 10)) + 'T12:00:00');
    if (!current) at.setMinutes(i * 6 + GAME_IDS.indexOf(game));
    const record = attempt.finish(answer(challenge, scores[game][i]!), at.toISOString());
    assert(record); assert.equal(record.correct, scores[game][i]); records.push(record);
  }
  records.sort((a, b) => a.at.localeCompare(b.at));
  for (const record of records) assert(await store.record(record));
  assert.equal(await store.record(records[0]!), false);
  assert.equal(saved.history.length, 62);
  assert.equal(today(saved, now).points, 4);
  const profile = exerciseProfile(saved.history);
  assert(profile.every(axis => axis.score !== null && axis.score > 0 && axis.score < 100));
  assert(new Set(profile.map(axis => axis.score)).size >= 4);
  return parseData(saved, now);
}
