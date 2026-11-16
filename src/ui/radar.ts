import { count, gameText, t, type Language } from '../i18n';
import type { exerciseProfile } from '../core/statistics';

type Profile = ReturnType<typeof exerciseProfile>;
const NS = 'http://www.w3.org/2000/svg';
const point = (axis: number, scale: number): [number, number] => {
  const angle = -Math.PI / 2 + axis * Math.PI / 3;
  return [100 + 80 * scale * Math.cos(angle), 100 + 80 * scale * Math.sin(angle)];
};

export function renderRadar(parent: HTMLElement, profile: Profile, language: Language): void {
  const figure = parent.createEl('figure', { cls: 'cmg-profile' });
  const id = 'cmg-profile-' + crypto.randomUUID();
  const heading = figure.createDiv({ cls: 'cmg-section-heading' });
  heading.createEl('h2', { text: t(language, 'profileTitle'), attr: { id } });
  heading.createSpan({ text: '0–100', cls: 'cmg-caption', attr: { 'aria-hidden': 'true' } });
  const plot = figure.createDiv({ cls: 'cmg-radar' });
  const svg = parent.ownerDocument.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 200 200'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-labelledby', id); svg.setAttribute('aria-describedby', id + '-summary');
  plot.appendChild(svg);
  const draw = (tag: string, attrs: Record<string, string | number>) => {
    const el = parent.ownerDocument.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
    svg.appendChild(el); return el;
  };
  const polygon = (values: number[]) => values.map((value, i) => point(i, value).join(',')).join(' ');
  for (const size of [.5, 1]) draw('polygon', { points: polygon(profile.map(() => size)), class: 'cmg-radar-ring' });
  profile.forEach((entry, i) => {
    const [x, y] = point(i, 1);
    draw('line', { x1: 100, y1: 100, x2: x, y2: y, class: 'cmg-radar-axis', 'data-game': entry.game });
    // HTML labels retain their font size when the SVG shrinks in a narrow Modal.
    plot.createSpan({ text: gameText(language, entry.game, 'name'), cls: `cmg-radar-label cmg-radar-label-${i}`, attr: { 'aria-hidden': 'true' } });
  });
  // Ten is a drawing baseline only; null stays null in statistics and text.
  draw('polygon', { points: polygon(profile.map(entry => (entry.score ?? 10) / 100)), class: 'cmg-radar-area' });
  for (const [i, entry] of profile.entries()) {
    const missing = entry.score === null;
    const [x, y] = point(i, (entry.score ?? 10) / 100);
    const dot = draw('circle', { cx: x, cy: y, r: 3, class: missing ? 'cmg-radar-missing' : 'cmg-radar-point' });
    if (!missing) dot.setAttribute('data-score', String(entry.score));
    const label = `${gameText(language, entry.game, 'name')}: ${missing ? t(language, 'profileNoData') : t(language, 'profileScore', { n: entry.score! })}`;
    const title = parent.ownerDocument.createElementNS(NS, 'title'); title.textContent = label; dot.appendChild(title);
    plot.querySelector<HTMLElement>(`.cmg-radar-label-${i}`)!.title = label;
  }
  figure.createEl('figcaption', { text: t(language, 'profileNote') + (profile.some(entry => entry.score === null) ? ' ' + t(language, 'profileMissing') : ''), cls: 'cmg-caption' });
  const summary = figure.createEl('ul', { cls: 'cmg-sr-only', attr: { id: id + '-summary' } });
  for (const entry of profile) summary.createEl('li', { text: t(language, 'profileAxis', {
    game: gameText(language, entry.game, 'name'), score: entry.score === null ? t(language, 'profileNoData') : t(language, 'profileScore', { n: entry.score }),
    samples: count(language, entry.stats?.recent.length ?? 0, 'attempt'),
  }) });
}
