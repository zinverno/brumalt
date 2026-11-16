import { isLogic, type AttemptRecord, type GameId, type Random } from './types';
import { shuffle } from '../games/random';

function leastRecent(games: GameId[], history: AttemptRecord[], random: Random): GameId[] {
  const last = new Map<GameId, number>();
  history.forEach((r, i) => last.set(r.game, i));
  return shuffle(games, random).sort((a, b) => (last.get(a) ?? -1) - (last.get(b) ?? -1));
}
export function planSession(enabled: GameId[], minutes: 1 | 3 | 5, history: AttemptRecord[], random: Random = Math.random): GameId[] {
  if (!enabled.length) throw new Error('Выберите хотя бы одну игру');
  const ordered = leastRecent([...new Set(enabled)], history, random);
  const plan = ordered.slice(0, minutes === 1 ? 1 : 3);
  if (minutes > 1 && plan.every(game => isLogic(game) === isLogic(plan[0]!))) {
    const other = ordered.find(game => isLogic(game) !== isLogic(plan[0]!));
    if (other) plan[plan.length - 1] = other;
  }
  return plan;
}
export function replacement(plan: GameId[], enabled: GameId[], history: AttemptRecord[], random: Random = Math.random, index?: number): GameId | undefined {
  let candidates = enabled.filter(game => !plan.includes(game));
  if (index !== undefined && plan.length > 1 && enabled.some(isLogic) && enabled.some(game => !isLogic(game))) {
    candidates = candidates.filter(game => {
      const next = plan.map((old, i) => i === index ? game : old);
      return next.some(isLogic) && next.some(id => !isLogic(id));
    });
  }
  return leastRecent(candidates, history, random)[0];
}
export class Session {
  index = 0;
  inBlock = 0;
  records: AttemptRecord[] = [];
  readonly attemptsPerBlock: number;
  constructor(readonly plan: GameId[], readonly minutes: 1 | 3 | 5, readonly free: boolean,
    private readonly now = () => performance.now(), private readonly started = now()) {
    // With fewer enabled disciplines, keep the chosen session's approximate attempt budget.
    this.attemptsPerBlock = Math.ceil(({ 1: 3, 3: 9, 5: 15 }[minutes]) / plan.length);
  }
  get game(): GameId { return this.plan[this.index]!; }
  add(record: AttemptRecord): void {
    if (this.records.some(item => item.id === record.id)) return;
    this.records.push(record); this.inBlock++;
  }
  advance(): 'attempt' | 'block' | 'end' {
    if (this.free) return 'attempt';
    if (this.now() - this.started >= this.minutes * 60_000) return 'end';
    if (this.inBlock < this.attemptsPerBlock) return 'attempt';
    if (this.index + 1 >= this.plan.length) return 'end';
    this.index++; this.inBlock = 0; return 'block';
  }
}
