import { isLogic, type AdaptiveState, type GameId } from './types';
import { parameters } from './config';

export const ADAPTATION = { window: 4, success: 0.9, difficulty: 0.5, difficulties: 3, wordsErrors: 2, logicSuccess: 1, logicDifficulty: 0 } as const;
export function adapt(state: AdaptiveState, accuracy: number, maxLevel: number, game: GameId = 'numbers'): AdaptiveState {
  const recent = [...state.recent, accuracy].slice(-ADAPTATION.window);
  const count = game === 'words' ? parameters(game, state.level).count : 0;
  const success = game === 'words' ? 1 : isLogic(game) ? ADAPTATION.logicSuccess : ADAPTATION.success;
  const difficulty = game === 'words' ? (count - ADAPTATION.wordsErrors) / count : isLogic(game) ? ADAPTATION.logicDifficulty : ADAPTATION.difficulty;
  let level = state.level;
  if (recent.length === ADAPTATION.window) {
    if (recent.every(value => value >= success)) level = Math.min(maxLevel, level + 1);
    else if (recent.filter(value => value <= difficulty).length >= ADAPTATION.difficulties)
      level = Math.max(1, level - 1);
  }
  return { level, recent: level !== state.level ? [] : recent };
}
