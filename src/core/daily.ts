import { GAME_IDS, type DailyEntry, type GameId, type Goal, type SavedData } from './types';

export const DAY_LIMIT = 365;
export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y!, m! - 1, d! + delta, 12));
}
export function validDay(day: unknown): day is string {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(day + 'T12:00:00');
  return Number.isFinite(date.getTime()) && localDay(date) === day;
}
export const validGoal = (goal: unknown): goal is Goal => goal === null || goal === 3 || goal === 6 || goal === 9 || goal === 12;
export const validPointGoal = (goal: unknown): goal is Goal => goal === null || goal === 6 || goal === 9 || goal === 12;
export const pointTarget = (goal: Goal): Goal => goal === 3 ? 6 : goal;
export const earnedPoints = (byGame: DailyEntry['byGame']): number => GAME_IDS.reduce((sum, id) => sum + (byGame[id] === 2 ? 3 : byGame[id] === 1 ? 2 : 0), 0);
export const nextPoints = (entry: DailyEntry | undefined, game: GameId): number => entry?.byGame[game] === 2 ? 0 : entry?.byGame[game] === 1 ? 1 : 2;
export function creditAttempt(entry: DailyEntry, game: GameId): void {
  entry.count++; entry.byGame[game] = Math.min(2, (entry.byGame[game] ?? 0) + 1);
  entry.points = earnedPoints(entry.byGame);
}
export function goalForDay(data: SavedData, day: string): Goal {
  const known = data.daily.days.find(entry => entry.day === day);
  if (known) return known.goal;
  const scheduled = data.daily.schedule.filter(entry => entry.from <= day).at(-1);
  return scheduled ? scheduled.goal : data.daily.schedule[0]!.goal;
}
export function today(data: SavedData, now = new Date()) {
  const day = localDay(now);
  const entry = data.daily.days.find(entry => entry.day === day);
  const goal = data.settings.goal === null ? null : goalForDay(data, day);
  return { day, count: entry?.count ?? 0, points: entry?.points ?? 0, legacy: entry?.legacy ?? null, goal, complete: goal !== null && (entry?.points ?? 0) >= goal };
}
export function ensureDay(data: SavedData, day: string, goal: Goal): DailyEntry {
  let entry = data.daily.days.find(item => item.day === day);
  if (!entry) { entry = { day, goal: pointTarget(goal), count: 0, reminded: false, points: 0, byGame: {}, legacy: null }; data.daily.days.push(entry); }
  data.daily.days.sort((a, b) => a.day.localeCompare(b.day));
  data.daily.days = data.daily.days.slice(-DAY_LIMIT);
  return entry;
}
export function week(data: SavedData, now = new Date()) {
  const offset = (now.getDay() + 6) % 7;
  const monday = shiftDay(localDay(now), -offset);
  return Array.from({ length: 7 }, (_, i) => {
    const day = shiftDay(monday, i);
    const entry = data.daily.days.find(item => item.day === day);
    const future = day > localDay(now);
    const retainedSince = data.daily.days.length === DAY_LIMIT ? data.daily.days[0]!.day : data.daily.since;
    const known = !!entry || (day >= data.daily.since && day >= retainedSince && !future);
    const status: 'unknown' | 'empty' | 'partial' | 'complete' | 'legacy' = !known || future ? 'unknown' : !entry?.count ? 'empty' : entry.legacy && entry.count === entry.legacy.count ? 'legacy' : entry.goal !== null && entry.points >= entry.goal ? 'complete' : 'partial';
    return { day, status, count: entry?.count ?? 0, points: entry?.points ?? 0, goal: entry ? entry.goal : known ? goalForDay(data, day) : null, legacy: entry?.legacy ?? null };
  });
}
export function timeReached(time: string, now: Date): boolean {
  const [h, m] = time.split(':').map(Number);
  return now.getHours() * 60 + now.getMinutes() >= h! * 60 + m!;
}
export function midnightDelay(now: Date): number {
  const next = new Date(now); next.setDate(next.getDate() + 1); next.setHours(0, 0, 0, 0);
  return Math.max(1, next.getTime() - now.getTime());
}
export function reminderDue(data: SavedData, now: Date): boolean {
  if (!data.settings.reminder.enabled || data.settings.goal === null) return false;
  const state = today(data, now);
  return state.goal !== null && !state.complete && timeReached(data.settings.reminder.time, now) &&
    !data.daily.days.some(entry => entry.day === state.day && entry.reminded);
}
// One local-calendar deadline, also rechecked on focus. No interval polling.
export function reminderDelay(data: SavedData, now: Date): number {
  const next = new Date(now); const [h, m] = data.settings.reminder.time.split(':').map(Number);
  next.setHours(h!, m!, 0, 0);
  if (next <= now) { next.setDate(next.getDate() + 1); next.setHours(0, 0, 0, 0); }
  return Math.max(1, next.getTime() - now.getTime());
}
