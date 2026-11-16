import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numbers } from '../src/games/numbers';
import { Attempt } from '../src/core/attempt';
import { Store } from '../src/core/storage';
import type { SavedData } from '../src/core/types';

test('Числа: полный цикл, начальные нули, позиции ошибок и однократное сохранение', async () => {
  const samples = [0, 0.1, 0.2, 0.3];
  const challenge = numbers.generate(1, () => samples.shift()!);
  assert.equal(challenge.game, 'numbers');
  if (challenge.game !== 'numbers') throw new Error('game');
  assert.equal(challenge.digits, '0123');
  let now = 0;
  const attempt = new Attempt('test-id', challenge, 'session-adaptive', numbers, () => now);
  let disk: SavedData | null = null;
  let writes = 0;
  const store = new Store({ read: async () => disk, write: async d => { writes++; disk = d; } });
  await store.load();
  assert.equal(attempt.finish('0123'), null);
  assert.equal(attempt.show(), true);
  assert.equal(attempt.show(), false);
  now = 8000;
  assert.equal(attempt.recall(), true);
  assert.equal(attempt.recall(), false);
  assert.equal(attempt.finish('012'), null);
  now = 10250;
  const result = attempt.finish('0923')!;
  assert.equal(result.correct, 3);
  assert.equal(result.total, 4);
  assert.equal(result.displayMs, 8000);
  assert.equal(result.responseMs, 2250);
  assert.equal(attempt.finish('0123'), null);
  assert.deepEqual(await Promise.all([store.record(result), store.record(result)]), [true, false]);
  assert.equal(writes, 1);
  const reopened = new Store({ read: async () => disk, write: async () => {} });
  await reopened.load();
  assert.equal(reopened.data.history.length, 1);
  assert.deepEqual(reopened.data.adaptive.numbers.recent, [0.75]);
});

test('Прерывание показа и ответа не создаёт результата', () => {
  for (const answerPhase of [false, true]) {
    const attempt = new Attempt('abort', numbers.generate(1, () => 0), 'session-adaptive', numbers);
    attempt.show(); if (answerPhase) attempt.recall();
    assert.equal(attempt.interrupt(), true);
    assert.equal(attempt.recall(), false);
    assert.equal(attempt.finish('0000'), null);
    assert.equal(attempt.record, undefined);
  }
});
