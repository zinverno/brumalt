import type { Attempt } from '../core/attempt';
import type { Answer, Figure, LocationChallenge } from '../core/types';
import { count as formatCount, clueText, figureLabel, ruleExplanation, shapeName, t, type Key, type Language } from '../i18n';
import { solveRule } from '../games/rule';
import { SHAPES, solveOrder } from '../games/order';
import { TILES } from '../games/sequence';
import { button, icon, text } from './dom';

export const tileName = (lang: Language, index: number): string => index === 3 ? t(lang, 'cross') : shapeName(lang, [0, 2, 1][index]!);

export function renderFigure(parent: HTMLElement, f: Figure, lang: Language): void {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = parent.ownerDocument.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 80 80'); svg.setAttribute('class', 'cmg-figure');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', figureLabel(lang, f));
  const path = parent.ownerDocument.createElementNS(ns, 'path');
  path.setAttribute('d', 'M40 20 L54 37 H46 V57 H34 V37 H26 Z');
  path.setAttribute('transform', `rotate(${f.direction * 90} 40 40)`);
  path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '2');
  path.setAttribute('fill', f.filled ? 'currentColor' : 'none'); svg.appendChild(path);
  [[40, 7], [73, 40], [40, 73], [7, 40]].forEach(([x, y], i) => {
    const dot = parent.ownerDocument.createElementNS(ns, 'circle');
    dot.setAttribute('cx', String(x)); dot.setAttribute('cy', String(y));
    dot.setAttribute('r', i === f.position ? '5' : '2'); dot.setAttribute('fill', 'currentColor');
    svg.appendChild(dot);
  });
  parent.appendChild(svg);
}
function shapeButton(parent: HTMLElement, shape: number, action: () => void, lang: Language): HTMLButtonElement {
  const b = button(parent, '', action); b.addClass('cmg-shape');
  b.createSpan({ text: SHAPES[shape]!.symbol, cls: 'cmg-shape-symbol', attr: { 'aria-hidden': 'true' } });
  b.createSpan({ text: shapeName(lang, shape) }); return b;
}

function locationGrid(parent: HTMLElement, challenge: LocationChallenge, reveal: boolean, lang: Language, answer?: number, submit?: (answer: Answer) => void): void {
  const size = challenge.params.gridSize!;
  const grid = parent.createDiv({ cls: 'cmg-grid cmg-location', attr: { 'aria-label': t(lang, 'grid') } });
  grid.style.setProperty('--cmg-columns', String(size));
  for (let cell = 0; cell < size * size; cell++) {
    const object = reveal ? challenge.objects.find(object => object.cell === cell) : undefined;
    const label = t(lang, 'cell', { row: Math.floor(cell / size) + 1, col: cell % size + 1 });
    const tile = button(grid, '', () => submit?.(cell)); tile.addClass('cmg-cell');
    tile.disabled = !submit;
    tile.setAttribute('aria-label', `${label}${object ? `: ${t(lang, object.icon as Key)}` : ''}`);
    if (object) { icon(tile, object.icon); tile.createSpan({ text: t(lang, object.icon as Key), cls: 'cmg-cell-label' }); }
    else tile.createSpan({ text: String(cell + 1), cls: 'cmg-cell-number' });
    if (answer !== undefined && cell === challenge.objects[challenge.target]!.cell) {
      tile.addClass('cmg-correct'); tile.createSpan({ text: '✓', cls: 'cmg-mark' });
      tile.setAttribute('aria-label', tile.getAttribute('aria-label') + '. ' + t(lang, 'correctCell'));
    } else if (cell === answer) {
      tile.addClass('cmg-wrong'); tile.createSpan({ text: '×', cls: 'cmg-mark' });
      tile.setAttribute('aria-label', label + '. ' + t(lang, 'wrongCell'));
    }
  }
}

export function renderChallenge(parent: HTMLElement, attempt: Attempt, submit: (answer: Answer) => void,
  later: (callback: () => void, ms: number) => void, lang: Language = 'ru'): void {
  const challenge = attempt.challenge;
  const showing = attempt.phase === 'show';
  switch (challenge.game) {
    case 'rule': {
      text(parent, t(lang, `ruleClass${challenge.level}` as Key), 'cmg-caption');
      const examples = parent.createDiv({ cls: 'cmg-rule-examples', attr: { 'aria-label': t(lang, 'examples') } });
      for (const example of challenge.examples) {
        const row = examples.createDiv({ cls: 'cmg-transform' });
        renderFigure(row, example.before, lang); row.createSpan({ text: '→' }); renderFigure(row, example.after, lang);
      }
      const question = parent.createDiv({ cls: 'cmg-transform cmg-question' });
      renderFigure(question, challenge.question, lang); question.createSpan({ text: '→ ?' });
      const options = parent.createDiv({ cls: 'cmg-options', attr: { 'aria-label': t(lang, 'chooseTransform') } });
      challenge.options.forEach((figure, i) => {
        const b = button(options, '', () => submit(i)); b.addClass('cmg-rule-option');
        renderFigure(b, figure, lang); b.setAttribute('aria-label', t(lang, 'option', { n: i + 1, figure: figureLabel(lang, figure) }));
        if (i === 0) b.setAttribute('data-autofocus', '');
      }); return;
    }
    case 'order': {
      const clues = parent.createEl('ul', { cls: 'cmg-clues' });
      for (const clue of challenge.clues) clues.createEl('li', { text: clueText(lang, clue) });
      text(parent, t(lang, challenge.objects.length === 3 ? 'middle' : challenge.position === 1 ? 'second' : 'third'), 'cmg-instruction');
      const options = parent.createDiv({ cls: 'cmg-options' });
      challenge.objects.forEach((shape, i) => {
        const b = shapeButton(options, shape, () => submit(shape), lang);
        if (i === 0) b.setAttribute('data-autofocus', '');
      }); return;
    }
    case 'numbers': {
      if (showing) {
        const digits = parent.createDiv({ cls: 'cmg-digits', attr: { 'aria-label': challenge.digits.split('').join(' ') } });
        for (const digit of challenge.digits) digits.createSpan({ text: digit, attr: { 'aria-hidden': 'true' } });
        return;
      }
      const label = parent.createEl('label', { cls: 'cmg-number-label', text: t(lang, 'numberInput', { count: formatCount(lang, challenge.params.count, 'digitAcc') }) });
      const input = label.createEl('input', { type: 'text', cls: 'cmg-number-input', attr: {
        inputmode: 'numeric', autocomplete: 'off', spellcheck: 'false', 'data-autofocus': '',
        'aria-label': t(lang, 'numberAnswer', { count: formatCount(lang, challenge.params.count, 'digit') }),
      } });
      input.maxLength = challenge.params.count;
      const count = text(parent, '', 'cmg-caption');
      const pad = parent.createDiv({ cls: 'cmg-keypad', attr: { role: 'group', 'aria-label': t(lang, 'keypad') } });
      for (const digit of '123456789') button(pad, digit, () => append(digit));
      const remove = button(pad, '⌫', () => { input.value = input.value.slice(0, -1); update(); input.focus(); });
      remove.setAttribute('aria-label', t(lang, 'deleteDigit'));
      button(pad, '0', () => append('0'));
      const confirm = button(pad, t(lang, 'done'), () => submit(input.value), true);
      const update = () => {
        input.value = input.value.replace(/\D/g, '').slice(0, challenge.params.count);
        confirm.disabled = input.value.length !== challenge.params.count;
        remove.disabled = !input.value.length;
        count.setText(t(lang, 'answerCount', { n: input.value.length, total: challenge.params.count }));
      };
      const append = (digit: string) => { if (input.value.length < challenge.params.count) input.value += digit; update(); input.focus(); };
      input.addEventListener('input', update);
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); if (!confirm.disabled) submit(input.value); }
      });
      update(); return;
    }
    case 'location': {
      if (!showing) {
        const target = challenge.objects[challenge.target]!;
        const question = parent.createDiv({ cls: 'cmg-target' }); icon(question, target.icon);
        question.createEl('strong', { text: t(lang, 'locationQuestion', { item: t(lang, target.icon as Key) }) });
      }
      locationGrid(parent, challenge, showing, lang, undefined, showing ? undefined : submit);
      if (!showing) parent.querySelector('button')?.setAttribute('data-autofocus', '');
      return;
    }
    case 'words': {
      const grid = parent.createDiv({ cls: 'cmg-words' });
      if (showing) {
        for (const word of challenge.words) grid.createSpan({ text: word, cls: 'cmg-word' });
        return;
      }
      const selected = new Set<string>();
      const buttons: HTMLButtonElement[] = [];
      for (const word of challenge.options) {
        const item = button(grid, word, () => {
          if (selected.has(word)) selected.delete(word);
          else if (selected.size < challenge.params.count) selected.add(word);
          update();
        });
        item.addClass('cmg-word'); item.setAttribute('aria-pressed', 'false'); buttons.push(item);
      }
      buttons[0]?.setAttribute('data-autofocus', '');
      const count = text(parent, '', 'cmg-caption');
      const confirm = button(parent, t(lang, 'confirm'), () => submit([...selected]), true);
      const update = () => {
        buttons.forEach((item, i) => {
          const pressed = selected.has(challenge.options[i]!);
          item.setAttribute('aria-pressed', String(pressed));
          item.disabled = !pressed && selected.size === challenge.params.count;
        });
        count.setText(t(lang, 'selected', { n: selected.size, total: challenge.params.count }));
        confirm.disabled = selected.size !== challenge.params.count;
      };
      update(); return;
    }
    case 'sequence': {
      const progress = text(parent, showing ? t(lang, 'getReady') : t(lang, 'repeatSteps', { steps: formatCount(lang, challenge.steps.length, 'step') }), 'cmg-instruction');
      progress.setAttribute('role', 'status');
      const grid = parent.createDiv({ cls: 'cmg-sequence' });
      const answer: number[] = [];
      const buttons = TILES.map((tile, i) => {
        const el = button(grid, '', () => {
          if (attempt.phase !== 'answer') return;
          answer.push(i);
          progress.setText(t(lang, 'entered', { n: answer.length, total: challenge.steps.length }));
          entered.setText(answer.map(step => TILES[step]!.symbol).join(' → '));
          if (i !== challenge.steps[answer.length - 1] || answer.length === challenge.steps.length) submit(answer);
        });
        el.addClass('cmg-tile', `cmg-${tile.color}`);
        el.createSpan({ text: tile.symbol, cls: 'cmg-symbol', attr: { 'aria-hidden': 'true' } });
        el.createSpan({ text: tileName(lang, i) });
        el.setAttribute('aria-label', tileName(lang, i)); el.disabled = showing;
        return el;
      });
      const entered = text(parent, showing ? t(lang, 'separateFlash') : '', 'cmg-entered');
      if (showing) {
        challenge.steps.forEach((step, index) => {
          const start = 500 + index * (challenge.params.pulseMs! + challenge.params.gapMs!);
          later(() => { buttons[step]!.addClass('is-lit'); progress.setText(t(lang, 'flash', { n: index + 1, total: challenge.steps.length, tile: tileName(lang, step) })); }, start);
          later(() => { buttons[step]!.removeClass('is-lit'); }, start + challenge.params.pulseMs!);
        });
      } else buttons[0]?.setAttribute('data-autofocus', '');
      return;
    }
  }
}

export function renderFeedback(parent: HTMLElement, attempt: Attempt, lang: Language = 'ru'): void {
  const challenge = attempt.challenge;
  switch (challenge.game) {
    case 'rule': {
      text(parent, ruleExplanation(lang, challenge.rule), 'cmg-explanation');
      const correct = solveRule(challenge)!;
      const row = parent.createDiv({ cls: 'cmg-transform' });
      renderFigure(row, challenge.question, lang); row.createSpan({ text: '→' }); renderFigure(row, challenge.options[correct]!, lang);
      return;
    }
    case 'order': {
      const solution = solveOrder(challenge)[0]!;
      text(parent, t(lang, 'orderAnswer', { order: solution.map(id => shapeName(lang, id)).join(' → ') }), 'cmg-explanation');
      text(parent, t(lang, 'orderReason', { shape: shapeName(lang, solution[challenge.position]!).toLowerCase() }));
      return;
    }
    case 'numbers': {
      text(parent, t(lang, 'digitReview'), 'cmg-caption');
      const answer = attempt.answer as string;
      const digits = parent.createDiv({ cls: 'cmg-digit-review' });
      [...challenge.digits].forEach((digit, i) => {
        const correct = digit === answer[i];
        const column = digits.createDiv({ cls: correct ? 'cmg-correct' : 'cmg-wrong',
          attr: { 'aria-label': t(lang, 'digitPosition', { n: i + 1, status: t(lang, correct ? 'correct' : 'wrong'), expected: digit, answer: answer[i]! }) } });
        column.createEl('strong', { text: digit }); column.createSpan({ text: answer[i] });
        column.createSpan({ text: correct ? '✓' : '×' });
      }); return;
    }
    case 'location':
      text(parent, t(lang, 'locationAnswer', { item: t(lang, challenge.objects[challenge.target]!.icon as Key) }), 'cmg-caption');
      locationGrid(parent, challenge, true, lang, attempt.answer as number); return;
    case 'words': {
      const selected = attempt.answer as string[];
      const grid = parent.createDiv({ cls: 'cmg-words' });
      for (const word of challenge.options) {
        const needed = challenge.words.includes(word); const chosen = selected.includes(word);
        if (!needed && !chosen) continue;
        const item = grid.createDiv({ cls: `cmg-word ${needed && chosen ? 'cmg-correct' : 'cmg-wrong'}` });
        item.createEl('strong', { text: word });
        item.createSpan({ text: t(lang, needed ? chosen ? 'wordCorrect' : 'wordMissing' : 'wordExtra'), cls: 'cmg-caption' });
      }
      return;
    }
    case 'sequence': {
      const names = (steps: number[]) => steps.map(step => `${TILES[step]!.symbol} ${tileName(lang, step)}`).join(' → ');
      text(parent, t(lang, 'expected', { value: names(challenge.steps) }), 'cmg-sequence-review');
      text(parent, t(lang, 'yourAnswer', { value: names(attempt.answer as number[]) }), 'cmg-sequence-review');
      if (attempt.record!.correct < attempt.record!.total) text(parent, t(lang, 'sequenceError', { n: attempt.record!.correct + 1 }), 'cmg-caption');
    }
  }
}
