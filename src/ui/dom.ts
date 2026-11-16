import { setIcon } from 'obsidian';
export function button(parent: HTMLElement, text: string, action: () => void, primary = false): HTMLButtonElement {
  const el = parent.createEl('button', { text, cls: primary ? 'mod-cta cmg-primary' : '' });
  el.type = 'button'; el.addEventListener('click', action); return el;
}
export function icon(parent: HTMLElement, name: string): HTMLElement {
  const el = parent.createSpan({ cls: 'cmg-icon', attr: { 'aria-hidden': 'true' } });
  if (name === 'cmg-positions') {
    // Local geometry avoids icon-name differences between Obsidian versions.
    const svg = el.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) svg.setAttribute(key, value);
    for (const [x, y] of [[3, 3], [14, 3], [3, 14], [14, 14]]) {
      const cell = el.ownerDocument.createElementNS(svg.namespaceURI, 'rect');
      for (const [key, value] of Object.entries({ x, y, width: 7, height: 7, rx: 1 })) cell.setAttribute(key, String(value));
      svg.appendChild(cell);
    }
    const marker = el.ownerDocument.createElementNS(svg.namespaceURI, 'circle');
    for (const [key, value] of Object.entries({ cx: '17.5', cy: '6.5', r: '1', fill: 'currentColor', stroke: 'none' })) marker.setAttribute(key, value);
    svg.appendChild(marker); el.appendChild(svg);
  } else setIcon(el, name);
  return el;
}
export function text(parent: HTMLElement, value: string, cls = 'cmg-muted'): HTMLParagraphElement {
  return parent.createEl('p', { text: value, cls });
}
