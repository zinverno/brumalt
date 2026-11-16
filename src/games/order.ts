import { parameters } from '../core/config';
import type { Clue, GameDefinition, OrderChallenge, Random } from '../core/types';
import { shuffle } from './random';

export const SHAPES = [
  { symbol: '●' }, { symbol: '■' },
  { symbol: '▲' }, { symbol: '◆' },
] as const;
export function permutations(items: number[]): number[][] {
  if (!items.length) return [[]];
  return items.flatMap((item, i) => permutations(items.filter((_, j) => j !== i)).map(tail => [item, ...tail]));
}
export function satisfies(order: number[], clue: Clue): boolean {
  const a = order.indexOf(clue.a);
  if (a < 0) return false;
  if (clue.kind === 'notEdge') return a > 0 && a < order.length - 1;
  const b = order.indexOf(clue.b);
  if (b < 0) return false;
  if (clue.kind === 'left') return a < b;
  if (clue.kind === 'right') return a > b;
  return a === b + 1;
}
export function solveOrder(c: Pick<OrderChallenge, 'objects' | 'clues'>): number[][] {
  return permutations(c.objects).filter(order => c.clues.every(clue => satisfies(order, clue)));
}
function template(level: number, random: Random): OrderChallenge {
  const params = parameters('order', level);
  const objects = shuffle([0, 1, 2, 3], random).slice(0, params.count);
  const solution = shuffle(objects, random);
  const clues: Clue[] = [];
  const kinds: Array<'left' | 'right' | 'nextRight'> = level === 1 ? ['left'] : ['left', 'right', 'nextRight'];
  for (const a of objects) for (const b of objects) {
    if (a === b) continue;
    for (const kind of kinds) {
      const clue = { kind, a, b }; if (satisfies(solution, clue)) clues.push(clue);
    }
  }
  const c: OrderChallenge = { game: 'order', level, params, objects, solution, clues: shuffle(clues, random), position: 1 };
  if (level === 4) { c.clues.unshift({ kind: 'notEdge', a: solution[1]! }); c.position = random() < .5 ? 1 : 2; }
  // Remove redundant clues, keeping the higher-level not-edge condition.
  for (let i = c.clues.length - 1; i >= (level === 4 ? 1 : 0); i--) {
    const trial = c.clues.filter((_, j) => i !== j);
    if (solveOrder({ ...c, clues: trial }).length === 1) c.clues = trial;
  }
  return c;
}
export function generateOrder(level: number, random: Random = Math.random, tries = 12): OrderChallenge {
  parameters('order', level);
  for (let i = 0; i < tries; i++) {
    const c = template(level, random);
    if (solveOrder(c).length === 1) return c;
  }
  const c = template(level, () => 0);
  if (solveOrder(c).length !== 1) throw new Error('Invalid order fallback');
  return c;
}
export const order: GameDefinition = {
  icon: 'list-ordered', maxLevel: 4,
  parameters: level => parameters('order', level), generate: (level, random) => generateOrder(level, random),
  evaluate(c, answer) {
    if (c.game !== 'order' || typeof answer !== 'number' || !c.objects.includes(answer)) return null;
    const solutions = solveOrder(c);
    return solutions.length === 1 ? { correct: Number(solutions[0]![c.position] === answer), total: 1 } : null;
  },
};
