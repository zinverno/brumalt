import { isLogic, type Answer, type AttemptRecord, type Challenge, type DisplayEnd, type GameDefinition, type Mode, type Phase, type Goal } from './types';

import { localDay } from './daily';

export class Attempt {
  phase: Phase = 'preparation';
  record?: AttemptRecord;
  answer?: Answer;
  private shownAt = 0;
  private answerAt = 0;
  private displayEnd: DisplayEnd = 'timer';
  constructor(readonly id: string, readonly challenge: Challenge, readonly mode: Mode,
    private readonly game: GameDefinition, private readonly now = () => performance.now()) {}
  show(): boolean {
    if (this.phase !== 'preparation') return false;
    this.phase = 'show'; this.shownAt = this.now();
    if (isLogic(this.challenge.game)) this.recall('visible');
    return true;
  }
  recall(displayEnd: DisplayEnd = 'timer'): boolean {
    if (this.phase !== 'show' || (displayEnd === 'ready' && this.challenge.game === 'sequence') || (isLogic(this.challenge.game) !== (displayEnd === 'visible'))) return false;
    this.displayEnd = displayEnd;
    this.phase = 'answer'; this.answerAt = this.now(); return true;
  }
  finish(answer: Answer, at = new Date().toISOString(), dayGoal: Goal = 6): AttemptRecord | null {
    if (this.phase !== 'answer') return null;
    const score = this.game.evaluate(this.challenge, answer);
    if (!score) return null;
    this.phase = 'result';
    this.answer = Array.isArray(answer) ? [...answer] as Answer : answer;
    this.record = { goalVersion: 2, materialLanguage: this.challenge.game === 'words' ? this.challenge.language : null, id: this.id, at, day: localDay(new Date(at)), dayGoal, game: this.challenge.game, rulesVersion: 1, mode: this.mode,
      level: this.challenge.level, params: { ...this.challenge.params }, elementCount: this.challenge.params.count,
      displayMs: isLogic(this.challenge.game) ? 0 : Math.max(0, Math.round(this.answerAt - this.shownAt)),
      displayEnd: this.displayEnd,
      responseMs: Math.max(0, Math.round(this.now() - this.answerAt)), ...score };
    return this.record;
  }
  interrupt(): boolean {
    if (this.phase !== 'show' && this.phase !== 'answer') return false;
    this.phase = 'interrupted'; return true;
  }
}
