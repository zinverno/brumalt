import { parameters } from '../core/config';
import type { GameDefinition } from '../core/types';
import { shuffle } from './random';

export const OBJECTS = [
  { icon: 'sun' }, { icon: 'key' },
  { icon: 'apple' }, { icon: 'fish' },
  { icon: 'umbrella' }, { icon: 'house' },
  { icon: 'heart' }, { icon: 'scissors' },
  { icon: 'flower' },
] as const;
export const location: GameDefinition = {
  icon: 'cmg-positions', maxLevel: 8,
  parameters: level => parameters('location', level),
  generate(level, random = Math.random) {
    const params = parameters('location', level);
    const cells = shuffle(Array.from({ length: params.gridSize! ** 2 }, (_, i) => i), random);
    const objects = shuffle(OBJECTS, random).slice(0, params.count).map((object, i) => ({ ...object, cell: cells[i]! }));
    return { game: 'location', level, params, objects, target: Math.floor(random() * objects.length) };
  },
  evaluate(challenge, answer) {
    if (challenge.game !== 'location' || typeof answer !== 'number' || !Number.isInteger(answer) ||
        answer < 0 || answer >= challenge.params.gridSize! ** 2) return null;
    return { correct: Number(answer === challenge.objects[challenge.target]!.cell), total: 1 };
  },
};
