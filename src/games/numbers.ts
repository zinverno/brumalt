import type { GameDefinition } from '../core/types';
import { parameters } from '../core/config';

export const numberParameters = (level: number) => parameters('numbers', level);
export const numbers: GameDefinition = {
  icon: 'binary', maxLevel: 10,
  parameters: numberParameters,
  generate(level, random = Math.random) {
    const params = numberParameters(level);
    const digits = Array.from({ length: params.count }, () => Math.floor(random() * 10)).join('');
    return { game: 'numbers', level, params, digits };
  },
  evaluate(challenge, answer) {
    if (challenge.game !== 'numbers' || typeof answer !== 'string' ||
        !/^\d+$/.test(answer) || answer.length !== challenge.digits.length) return null;
    return { correct: [...answer].filter((digit, i) => digit === challenge.digits[i]).length,
      total: challenge.digits.length };
  },
};
