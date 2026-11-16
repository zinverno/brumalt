import { parameters } from '../core/config';
import type { GameDefinition } from '../core/types';
export const TILES = [
  { symbol: '●', color: 'blue' },
  { symbol: '▲', color: 'orange' },
  { symbol: '■', color: 'green' },
  { symbol: '✚', color: 'purple' },
] as const;
export const sequence: GameDefinition = {
  icon: 'list-ordered', maxLevel: 10,
  parameters: level => parameters('sequence', level),
  generate(level, random = Math.random) {
    const params = parameters('sequence', level);
    return { game: 'sequence', level, params, steps: Array.from({ length: params.count }, () => Math.floor(random() * 4)) };
  },
  evaluate(challenge, answer) {
    if (challenge.game !== 'sequence' || !Array.isArray(answer) || !answer.length || answer.length > challenge.steps.length ||
        !answer.every(step => typeof step === 'number' && Number.isInteger(step) && step >= 0 && step < 4)) return null;
    const firstError = answer.findIndex((step, i) => step !== challenge.steps[i]);
    if (firstError < 0 && answer.length < challenge.steps.length) return null;
    return { correct: firstError < 0 ? answer.length : firstError, total: challenge.steps.length };
  },
};
