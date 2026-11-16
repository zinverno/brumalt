import { test } from 'node:test';
import assert from 'node:assert/strict';
import { showcaseData } from '../scripts/showcase-data';
import { defaults, parseData, Store } from '../src/core/storage';
import { today, week } from '../src/core/daily';
import { exerciseProfile } from '../src/core/statistics';

test('synthetic showcase uses valid completions and Store points without touching real data', async () => {
  const now = new Date(2026, 10, 19, 15);
  const data = await showcaseData(now);
  assert.deepEqual(data, await showcaseData(now));
  assert.deepEqual(parseData(JSON.parse(JSON.stringify(data)), now), data);
  assert.equal(data.history.length, 62);
  assert.equal(new Set(data.history.map(record => record.id)).size, 62);
  assert.equal(today(data, now).points, 4);
  assert.equal(week(data, now).find(entry => entry.day === today(data, now).day)?.status, 'partial');
  assert(exerciseProfile(data.history).every(axis => axis.target && axis.score !== null));
  assert(data.history.some(record => record.correct < record.total));
  assert.equal(data.settings.reminder.enabled, false);
  const store = new Store({ read: async () => data, write: async () => assert.fail('Duplicate should not write') });
  await store.load();
  assert.equal(await store.record(data.history[0]!), false);
  assert.equal(defaults(now).history.length, 0);
});
