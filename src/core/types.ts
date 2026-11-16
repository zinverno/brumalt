import type { Language, LanguageSetting } from '../i18n';
export const GAME_IDS = ['numbers', 'location', 'words', 'sequence', 'rule', 'order'] as const;
export type GameId = typeof GAME_IDS[number];
export type Mode = 'session-adaptive' | 'free-adaptive' | 'free-manual';
export type DisplayEnd = 'timer' | 'ready' | 'visible';
export type Phase = 'preparation' | 'show' | 'answer' | 'result' | 'interrupted';
export type Random = () => number;
export interface Parameters {
  count: number;
  showMs: number;
  gridSize?: number;
  distractors?: number;
  tiles?: number;
  pulseMs?: number;
  gapMs?: number;
  variant?: number;
}
interface BaseChallenge { game: GameId; level: number; params: Parameters }
export interface NumbersChallenge extends BaseChallenge { game: 'numbers'; digits: string }
export interface LocationChallenge extends BaseChallenge {
  game: 'location'; objects: { icon: string; cell: number }[]; target: number;
}
export interface WordsChallenge extends BaseChallenge { game: 'words'; language: Language; words: string[]; options: string[] }
export interface SequenceChallenge extends BaseChallenge { game: 'sequence'; steps: number[] }
export interface Figure { direction: number; position: number; filled: boolean }
export interface Transform { rotation: number; movement: number; flip: boolean }
export interface RuleChallenge extends BaseChallenge {
  game: 'rule'; examples: { before: Figure; after: Figure }[];
  question: Figure; options: Figure[]; rule: Transform; answer: number;
}
export type Clue = { kind: 'left' | 'right' | 'nextRight'; a: number; b: number } | { kind: 'notEdge'; a: number };
export interface OrderChallenge extends BaseChallenge {
  game: 'order'; objects: number[]; clues: Clue[]; position: number; solution: number[];
}
export const isLogic = (game: GameId): boolean => game === 'rule' || game === 'order';
export type Challenge = RuleChallenge | OrderChallenge | NumbersChallenge | LocationChallenge | WordsChallenge | SequenceChallenge;
export type Answer = string | string[] | number | number[];
export interface Score { correct: number; total: number }
export interface AttemptRecord extends Score {
  id: string;
  at: string;
  game: GameId;
  rulesVersion: 1;
  mode: Mode;
  level: number;
  params: Parameters;
  elementCount: number;
  displayMs: number;
  displayEnd: DisplayEnd;
  responseMs: number;
  day: string | null;
  dayGoal: Goal;
  goalVersion: 1 | 2;
  materialLanguage: Language | null;
}
export interface AdaptiveState { level: number; recent: number[] }
export interface Preference { manual: boolean; level: number }
export type Goal = 3 | 6 | 9 | 12 | null;
export interface DailyEntry {
  day: string; goal: Goal; count: number; reminded: boolean;
  points: number; byGame: Partial<Record<GameId, number>>;
  legacy: { count: number; goal: Goal; credited: boolean } | null;
}
export interface SavedData {
  schemaVersion: 4;
  settings: {
    minutes: 1 | 3 | 5;
    language: LanguageSetting;
    goal: Goal;
    reminder: { enabled: boolean; time: string };

    enabled: GameId[];
    practice: Record<GameId, Preference>;
  };
  adaptive: Record<GameId, AdaptiveState>;
  history: AttemptRecord[];
  daily: { since: string; days: DailyEntry[]; schedule: { from: string; goal: Goal }[]; reminderOffered: boolean };
}
export interface GameDefinition {
  icon: string;
  maxLevel: number;
  parameters: (level: number) => Parameters;
  generate: (level: number, random?: Random, language?: Language) => Challenge;
  evaluate: (challenge: Challenge, answer: Answer) => Score | null;
}
