import { en } from './en';
import { ru } from './ru';
import { plural } from '../core/language';
import type { Clue, DisplayEnd, Figure, GameId, Mode, Parameters, Transform } from '../core/types';
export type Language = 'en' | 'ru';
export type LanguageSetting = Language | 'auto';
export type Key = keyof typeof en;
export const dictionaries = { en, ru };
export function resolveLanguage(setting: LanguageSetting, host?: string, environment?: string): Language {
  if (setting !== 'auto') return setting;
  return /^(ru)(-|_|$)/i.test(host || environment || 'en') ? 'ru' : 'en';
}
export function t(lang: Language, key: Key, values: Record<string, string | number> = {}): string {
  return dictionaries[lang][key].replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
}
const units = {
  attempt: [['attempt', 'attempts'], ['попытка', 'попытки', 'попыток']],
  point: [['point', 'points'], ['балл', 'балла', 'баллов']],
  digit: [['digit', 'digits'], ['цифра', 'цифры', 'цифр']],
  digitAcc: [['digit', 'digits'], ['цифру', 'цифры', 'цифр']],
  word: [['word', 'words'], ['слово', 'слова', 'слов']],
  step: [['step', 'steps'], ['шаг', 'шага', 'шагов']],
  item: [['item', 'items'], ['предмет', 'предмета', 'предметов']],
  shape: [['shape', 'shapes'], ['фигура', 'фигуры', 'фигур']],
  game: [['game', 'games'], ['игра', 'игры', 'игр']],
} as const;
export function count(lang: Language, n: number, unit: keyof typeof units): string {
  const forms = units[unit];
  return `${n} ${lang === 'ru' ? plural(n, forms[1][0], forms[1][1], forms[1][2]) : forms[0][n === 1 ? 0 : 1]}`;
}
export const locale = (lang: Language): string => lang === 'ru' ? 'ru-RU' : 'en-US';
export const timeText = (lang: Language, ms: number): string => t(lang, 'seconds', { n: (ms / 1000).toLocaleString(locale(lang), { maximumFractionDigits: 1 }) });
export const gameText = (lang: Language, game: GameId, field: 'name' | 'rule' | 'hint'): string => t(lang, `game.${game}.${field}`);
export function describe(lang: Language, game: GameId, p: Parameters, compact = false): string {
  switch (game) {
    case 'rule': return t(lang, `rule${p.variant}` as Key);
    case 'order': return count(lang, p.count, 'shape') + (compact ? '' : ` · ${t(lang, `order${p.variant}` as Key)}`);
    case 'numbers': return count(lang, p.count, 'digit');
    case 'words': return compact ? count(lang, p.count, 'word') : t(lang, 'wordsParams', { words: count(lang, p.count, 'word'), n: p.distractors! });
    case 'location': return t(lang, 'locationParams', { size: p.gridSize!, items: count(lang, p.count, 'item') });
    case 'sequence': return compact ? count(lang, p.count, 'step') : t(lang, 'sequenceParams', { steps: count(lang, p.count, 'step'), n: p.tiles! });
  }
}
export const displayText = (lang: Language, end: DisplayEnd): string => t(lang, { timer: 'timer', ready: 'early', visible: 'visible' }[end] as Key);
export const modeText = (lang: Language, mode: Mode): string => t(lang, { 'session-adaptive': 'sessionMode', 'free-adaptive': 'freeMode', 'free-manual': 'manualMode' }[mode] as Key);
export const shapeName = (lang: Language, n: number): string => t(lang, `shape${n}` as Key);
export function clueText(lang: Language, clue: Clue): string {
  return t(lang, { left: 'clueLeft', right: 'clueRight', nextRight: 'clueNext', notEdge: 'clueEdge' }[clue.kind] as Key,
    { a: shapeName(lang, clue.a), b: clue.kind === 'notEdge' ? '' : t(lang, `shapeGen${clue.b}` as Key) });
}
export function ruleExplanation(lang: Language, rule: Transform): string {
  return [rule.rotation ? t(lang, 'arrowRule', { turn: t(lang, `turn${rule.rotation}` as Key) }) : '',
    rule.movement ? t(lang, 'markerRule', { turn: t(lang, `turn${rule.movement}` as Key) }) : '', rule.flip ? t(lang, 'fillRule') : ''].filter(Boolean).join('; ') + '.';
}
export function figureLabel(lang: Language, figure: Figure): string {
  return t(lang, 'figure', { direction: t(lang, (['up', 'right', 'down', 'left'] as const)[figure.direction]!),
    fill: t(lang, figure.filled ? 'filled' : 'outline'), position: t(lang, (['top', 'rightSide', 'bottom', 'leftSide'] as const)[figure.position]!) });
}
