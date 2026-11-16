import { GAME_IDS, type AttemptRecord } from './types';
const RECENT_LIMIT = 10;
export function comparableKey(r: AttemptRecord): string {
  return JSON.stringify([r.game, r.rulesVersion, r.mode, r.level, r.displayEnd, r.materialLanguage,
    Object.entries(r.params).sort(([a], [b]) => a.localeCompare(b))]);
}
export function comparison(history: AttemptRecord[], target: AttemptRecord) {
  const matching = history.filter(r => comparableKey(r) === comparableKey(target));
  const recent = matching.slice(-RECENT_LIMIT);
  const perfect = matching.filter(r => r.correct === r.total);
  return { recent, successes: recent.filter(r => r.correct === r.total).length,
    bestMs: perfect.length ? Math.min(...perfect.map(r => r.responseMs)) : null };
}

export function exerciseProfile(history: AttemptRecord[]) {
  return GAME_IDS.map(game => {
    const played = history.filter(record => record.game === game);
    const target = played.at(-1);
    const stats = target ? comparison(played, target) : null;
    // Unfilled slots are neutral (50%), so a small sample is not an extreme score.
    const accuracy = stats?.recent.reduce((sum, record) => sum + record.correct / record.total, 0) ?? 0;
    const smoothed = stats ? (accuracy + (RECENT_LIMIT - stats.recent.length) * .5) / RECENT_LIMIT : 0;
    const score = stats ? 5 * Math.round(20 * smoothed) : null;
    return { game, played, target, stats, score };
  });
}
