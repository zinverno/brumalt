import { DAY_LIMIT, creditAttempt, earnedPoints, ensureDay, pointTarget, validPointGoal, goalForDay, localDay, reminderDue, shiftDay, validDay, validGoal } from './daily';
import { adapt } from './adaptation';
import { HISTORY_LIMIT, MAX_LEVEL, parameters } from './config';
import { GAME_IDS, isLogic, type AttemptRecord, type GameId, type Goal, type SavedData } from './types';

export function defaults(now = new Date()): SavedData {
  const adaptive = Object.fromEntries(GAME_IDS.map(id => [id, { level: 1, recent: [] as number[] }])) as SavedData['adaptive'];
  const practice = Object.fromEntries(GAME_IDS.map(id => [id, { manual: false, level: 1 }])) as SavedData['settings']['practice'];
  return { schemaVersion: 4, settings: { minutes: 3, language: 'auto', goal: 6, reminder: { enabled: false, time: '18:00' }, enabled: [...GAME_IDS], practice }, adaptive, history: [], daily: { since: localDay(now), days: [], schedule: [{ from: localDay(now), goal: 6 }], reminderOffered: false } };
}
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !array(v);
const array = (v: unknown): v is unknown[] => Array.isArray(v);
const integer = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const duration = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const gameId = (v: unknown): v is GameId => GAME_IDS.includes(v as GameId);

function validateRecord(v: unknown, version: number): v is Record<string, unknown> & { id: string } {
  if (!object(v) || !gameId(v.game) || !integer(v.level, 1, MAX_LEVEL[v.game]) ||
      v.rulesVersion !== 1 || typeof v.mode !== 'string' || !['session-adaptive', 'free-adaptive', 'free-manual'].includes(v.mode) ||
      typeof v.id !== 'string' || v.id.length < 1 || v.id.length > 100 ||
      typeof v.at !== 'string' || !Number.isFinite(Date.parse(v.at)) || new Date(v.at).toISOString() !== v.at ||
      !object(v.params) || !duration(v.displayMs) || !duration(v.responseMs)) return false;
  if (version === 1 ? v.displayEnd !== undefined : !['timer', 'ready', 'visible'].includes(String(v.displayEnd))) return false;
  if (version < 3 && isLogic(v.game)) return false;
  if (isLogic(v.game) !== (v.displayEnd === 'visible') || (isLogic(v.game) && v.displayMs !== 0)) return false;
  if (v.game === 'sequence' && v.displayEnd === 'ready') return false;
  if (version >= 3 && (!validGoal(v.dayGoal) || !(v.day === null ? v.dayGoal === null : validDay(v.day)))) return false;
  if (version === 4 && ((v.goalVersion !== 1 && v.goalVersion !== 2) ||
      (v.game === 'words' ? (v.materialLanguage !== 'en' && v.materialLanguage !== 'ru') : v.materialLanguage !== null))) return false;
  const expected = parameters(v.game, v.level);
  const actual = v.params;
  if (Object.keys(actual).length !== Object.keys(expected).length ||
      !Object.entries(expected).every(([key, value]) => actual[key] === value)) return false;
  const total = v.game === 'location' || isLogic(v.game) ? 1 : expected.count;
  return v.elementCount === expected.count && v.total === total && integer(v.correct, 0, total);
}
function validActivity(v: unknown): v is { day: string; goal: Goal; count: number; reminded: boolean } {
  return object(v) && validDay(v.day) && validGoal(v.goal) && integer(v.count, 0, Number.MAX_SAFE_INTEGER) && typeof v.reminded === 'boolean';
}
function validSchedule(v: unknown): v is { from: string; goal: Goal } {
  return object(v) && validDay(v.from) && validGoal(v.goal);
}
export function validRecord(v: unknown): v is AttemptRecord { return validateRecord(v, 4); }
export function parseData(raw: unknown, now = new Date()): SavedData {
  if (raw === null || raw === undefined) return defaults(now);
  if (!object(raw) || (raw.schemaVersion !== 1 && raw.schemaVersion !== 2 && raw.schemaVersion !== 3 && raw.schemaVersion !== 4) || !object(raw.settings) || !object(raw.adaptive))
    throw new Error('Неизвестная версия или повреждённая структура данных');
  const { settings, adaptive, history } = raw;
  if (![1, 3, 5].includes(Number(settings.minutes)) || typeof settings.minutes !== 'number' ||
      !array(settings.enabled) || !settings.enabled.length || !settings.enabled.every(gameId) ||
      new Set(settings.enabled).size !== settings.enabled.length || !object(settings.practice))
    throw new Error('Повреждены настройки');
  const originalGames = raw.schemaVersion >= 3 ? GAME_IDS : GAME_IDS.filter(id => !isLogic(id));
  if (!settings.enabled.every(id => originalGames.includes(id))) throw new Error('Неизвестная игра');
  for (const game of originalGames) {
    const a = adaptive[game]; const p = settings.practice[game];
    if (!object(a) || !integer(a.level, 1, MAX_LEVEL[game]) || !array(a.recent) || a.recent.length > 4 ||
        !a.recent.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1) ||
        !object(p) || typeof p.manual !== 'boolean' || !integer(p.level, 1, MAX_LEVEL[game]))
      throw new Error('Повреждены уровни сложности');
  }
  if (!array(history) || history.length > HISTORY_LIMIT || !history.every(r => validateRecord(r, Number(raw.schemaVersion))) ||
      new Set(history.map(r => r.id)).size !== history.length) throw new Error('Повреждена история попыток');
  if (raw.schemaVersion >= 3) {
    const daily = raw.daily;
    if (!validGoal(settings.goal) || !object(settings.reminder) || typeof settings.reminder.enabled !== 'boolean' ||
      typeof settings.reminder.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.reminder.time) ||
      !object(daily) || !validDay(daily.since) || typeof daily.reminderOffered !== 'boolean' ||
      !array(daily.days) || daily.days.length > DAY_LIMIT ||
      !daily.days.every(validActivity) ||
      new Set(daily.days.map(d => d.day)).size !== daily.days.length ||
      !array(daily.schedule) || !daily.schedule.length || daily.schedule.length > DAY_LIMIT + 1 ||
      !daily.schedule.every(validSchedule) ||
      daily.schedule.some((d, i, list) => { const previous = list[i - 1]; return previous !== undefined && d.from <= previous.from; })) throw new Error('Повреждены дневные данные');
  }
  if (raw.schemaVersion === 4) {
    const daily = raw.daily as Record<string, unknown>;
    if (!validPointGoal(settings.goal) || (settings.language !== 'auto' && settings.language !== 'en' && settings.language !== 'ru') ||
      !(daily.days as unknown[]).every(v => {
        if (!object(v) || !object(v.byGame) || !integer(v.points, 0, 18) || !validPointGoal(v.goal) ||
          !Object.entries(v.byGame).every(([id, count]) => gameId(id) && integer(count, 1, 2))) return false;
        const byGame = v.byGame as SavedData['daily']['days'][number]['byGame'];
        if (earnedPoints(byGame) !== v.points) return false;
        if (v.legacy !== null && (!object(v.legacy) || !integer(v.legacy.count, 0, Number(v.count)) || !validGoal(v.legacy.goal) || typeof v.legacy.credited !== 'boolean')) return false;
        const knownCount = Number(v.count) - (object(v.legacy) && !v.legacy.credited ? Number(v.legacy.count) : 0);
        const counts = Object.values(byGame);
        const creditedCount = counts.reduce((sum, count) => sum + count, 0);
        return creditedCount <= knownCount && (creditedCount === knownCount || counts.includes(2));
      }) || !(daily.schedule as { goal: unknown }[]).every(entry => validPointGoal(entry.goal))) throw new Error('Invalid points or language data');
  }
  const data = structuredClone(raw) as unknown as SavedData;
  if (raw.schemaVersion === 1) {
    data.history = data.history.map(record => ({ ...record, displayEnd: 'timer' }));
  }
  if (raw.schemaVersion < 3) {
    data.settings.goal = 6; data.settings.reminder = { enabled: false, time: '18:00' };
    data.daily = defaults(now).daily;
    data.history = data.history.map(record => ({ ...record, day: null, dayGoal: null }));
    for (const game of ['rule', 'order'] as const) {
      data.adaptive[game] = { level: 1, recent: [] };
      data.settings.practice[game] = { level: 1, manual: false };
    }
  }
  if (raw.schemaVersion < 4) {
    data.settings.language = 'auto'; data.settings.goal = pointTarget(data.settings.goal);
    data.daily.schedule = data.daily.schedule.map(entry => ({ ...entry, goal: pointTarget(entry.goal) }));
    data.daily.days = data.daily.days.map(entry => {
      const records = data.history.filter(record => record.day === entry.day);
      const credited = records.length === entry.count;
      const byGame: SavedData['daily']['days'][number]['byGame'] = {};
      if (credited) for (const record of records) byGame[record.game] = Math.min(2, (byGame[record.game] ?? 0) + 1);
      return { ...entry, goal: pointTarget(entry.goal), points: earnedPoints(byGame), byGame,
        legacy: { count: entry.count, goal: entry.goal, credited } };
    });
    data.history = data.history.map(record => ({ ...record, goalVersion: 1, materialLanguage: record.game === 'words' ? 'ru' : null }));
    data.schemaVersion = 4;
  }
  return data;
}

export interface StoragePort { read: () => Promise<unknown>; write: (data: SavedData) => Promise<void> }
export class Store {
  data = defaults();
  loadError: 'loadFailed' | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  private configurationWrites = 0;
  private committed = new Set<string>();
  get configurationBusy(): boolean { return this.configurationWrites > 0; }
  constructor(private readonly port: StoragePort) {}
  async load(): Promise<void> {
    try { this.data = parseData(await this.port.read()); this.committed = new Set(this.data.history.map(r => r.id)); }
    catch { this.loadError = 'loadFailed'; }
  }
  private transact<T>(change: (next: SavedData) => T, shouldSave: (result: T) => boolean = () => true): Promise<T> {
    const run = this.tail.then(async () => {
      if (this.loadError) throw new Error(this.loadError);
      const next = structuredClone(this.data);
      const result = change(next);
      if (shouldSave(result)) {
        parseData(next);
        await this.port.write(next);
        this.data = next;
      }
      return result;
    });
    this.tail = run.catch(() => undefined);
    return run;
  }
  record(record: AttemptRecord): Promise<boolean> {
    // Capture before enqueueing so the caller cannot alter a pending write.
    const captured = structuredClone(record);
    return this.transact(next => {
      if (!validRecord(captured)) throw new Error('Некорректный результат');
      if (this.committed.has(captured.id) || next.history.some(item => item.id === captured.id)) return false;
      next.history = [...next.history, captured].slice(-HISTORY_LIMIT);
      if (captured.mode !== 'free-manual' && next.adaptive[captured.game].level === captured.level)
        next.adaptive[captured.game] = adapt(next.adaptive[captured.game], captured.correct / captured.total, MAX_LEVEL[captured.game], captured.game);
      if (captured.day) creditAttempt(ensureDay(next, captured.day, captured.dayGoal), captured.game);
      return true;
    }, saved => saved).then(saved => { if (saved) this.committed.add(captured.id); return saved; });
  }
  setGoal(goal: Goal, now = new Date()): Promise<void> {
    const day = localDay(now); const from = goal === null ? day : shiftDay(day, 1);
    return this.configure(next => {
      if (!validPointGoal(goal)) throw new Error('Некорректная цель');
      next.settings.goal = goal;
      if (goal === null) {
        next.settings.reminder.enabled = false;
        ensureDay(next, day, null).goal = null;
      }
      next.daily.schedule = [...next.daily.schedule.filter(entry => entry.from !== from && (goal !== null || entry.from < day)), { from, goal }]
        .sort((a, b) => a.from.localeCompare(b.from)).slice(-DAY_LIMIT - 1);
    });
  }
  setReminder(enabled: boolean, time = this.data.settings.reminder.time): Promise<void> {
    return this.configure(next => {
      next.settings.reminder = { enabled, time };
      next.daily.reminderOffered = true;
    });
  }
  offerReminder(): Promise<void> {
    return this.transact(next => { next.daily.reminderOffered = true; });
  }
  claimReminder(now: Date, available: () => boolean): Promise<boolean> {
    const day = localDay(now);
    return this.transact(next => {
      if (!available() || !reminderDue(next, now)) return false;
      ensureDay(next, day, goalForDay(next, day)).reminded = true;
      return true;
    }, claimed => claimed);
  }
  releaseReminder(day: string): Promise<void> {
    return this.transact(next => { const entry = next.daily.days.find(d => d.day === day); if (entry) entry.reminded = false; });
  }
  settings(change: (settings: SavedData['settings']) => void): Promise<void> {
    return this.configure(next => change(next.settings));
  }
  setMinutes(minutes: 1 | 3 | 5): Promise<void> {
    // Session length only affects future plans; saving it need not block a live attempt.
    return this.transact(next => { next.settings.minutes = minutes; });
  }
  setAdaptiveLevel(game: GameId, level: number): Promise<void> {
    return this.configure(next => { next.adaptive[game] = { level, recent: [] }; });
  }
  private configure(change: (next: SavedData) => void): Promise<void> {
    this.configurationWrites++;
    return this.transact(change).finally(() => { this.configurationWrites--; });
  }
  flush(): Promise<unknown> { return this.tail; }
}
