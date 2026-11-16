import { parameters } from '../core/config';
import type { Figure, GameDefinition, Random, RuleChallenge, Transform } from '../core/types';
import { shuffle } from './random';

export const figureKey = (f: Figure): string => `${f.direction}:${f.position}:${Number(f.filled)}`;
export function applyRule(f: Figure, r: Transform): Figure {
  return { direction: (f.direction + r.rotation) % 4, position: (f.position + r.movement) % 4, filled: r.flip ? !f.filled : f.filled };
}
// This finite class is also explained in the UI. No unstated, arbitrary transformations.
export function ruleClass(level: number): Transform[] {
  const rules: Transform[] = [];
  for (let rotation = 0; rotation < 4; rotation++) for (let movement = 0; movement < 4; movement++) for (const flip of [false, true]) {
    const operations = Number(rotation !== 0) + Number(movement !== 0) + Number(flip);
    if (operations < 1 || operations > (level === 4 ? 2 : 1) || (level < 2 && movement) || (level < 3 && flip)) continue;
    rules.push({ rotation, movement, flip });
  }
  return rules;
}
export const FIGURES: Figure[] = Array.from({ length: 32 }, (_, i) => ({ direction: i % 4, position: Math.floor(i / 4) % 4, filled: i >= 16 }));
export function solveRule(c: Pick<RuleChallenge, 'level' | 'examples' | 'question' | 'options'>): number | null {
  const matching = ruleClass(c.level).filter(r => c.examples.every(e => figureKey(applyRule(e.before, r)) === figureKey(e.after)));
  const predictions = new Set(matching.map(r => figureKey(applyRule(c.question, r))));
  if (predictions.size !== 1 || new Set(c.options.map(figureKey)).size !== 4) return null;
  const index = c.options.findIndex(f => predictions.has(figureKey(f)));
  return index < 0 ? null : index;
}
function template(level: number, random: Random): RuleChallenge {
  const candidates = ruleClass(level).filter(r => level !== 4 || Number(!!r.rotation) + Number(!!r.movement) + Number(r.flip) === 2);
  const rule = candidates[Math.floor(random() * candidates.length)]!;
  const figures = shuffle(FIGURES, random);
  const question = figures[2]!;
  const correct = applyRule(question, rule);
  const options = shuffle([correct, ...shuffle(FIGURES.filter(f => figureKey(f) !== figureKey(correct)), random).slice(0, 3)], random);
  return { game: 'rule', level, params: parameters('rule', level), rule, question, options,
    examples: figures.slice(0, 2).map(before => ({ before, after: applyRule(before, rule) })),
    answer: options.findIndex(f => figureKey(f) === figureKey(correct)) };
}
export function generateRule(level: number, random: Random = Math.random, tries = 12): RuleChallenge {
  parameters('rule', level);
  for (let i = 0; i < tries; i++) {
    const c = template(level, random);
    if (solveRule(c) === c.answer) return c;
  }
  const fallback = template(level, () => 0);
  if (solveRule(fallback) !== fallback.answer) throw new Error('Invalid rule fallback');
  return fallback;
}
export const rule: GameDefinition = {
  icon: 'rotate-cw', maxLevel: 4,
  parameters: level => parameters('rule', level), generate: (level, random) => generateRule(level, random),
  evaluate(c, answer) {
    if (c.game !== 'rule' || typeof answer !== 'number' || !Number.isInteger(answer) || answer < 0 || answer >= c.options.length) return null;
    const correct = solveRule(c);
    return correct === null ? null : { correct: Number(answer === correct), total: 1 };
  },
};
