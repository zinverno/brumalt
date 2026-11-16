import type { GameId, Parameters } from './types';

export const MAX_LEVEL: Record<GameId, number> = { numbers: 10, location: 8, words: 7, sequence: 10, rule: 4, order: 4 };
export const HISTORY_LIMIT = 1000;
export function parameters(game: GameId, level: number): Parameters {
  if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL[game]) throw new Error('Недопустимый уровень');
  switch (game) {
    case 'rule': return { count: 2, showMs: 0, variant: level };
    case 'order': return { count: level < 3 ? 3 : 4, showMs: 0, variant: level === 1 ? 0 : level < 4 ? 1 : 2 };
    case 'numbers': return { count: level + 3, showMs: 8000 };
    case 'words': return { count: level + 3, distractors: 4, showMs: 10000 };
    case 'location': return { count: level < 5 ? level + 2 : level + 1, gridSize: level < 5 ? 3 : 4, showMs: 8000 };
    case 'sequence': return { count: level + 2, tiles: 4, pulseMs: 600, gapMs: 250, showMs: 500 + (level + 2) * 850 };
  }
}
