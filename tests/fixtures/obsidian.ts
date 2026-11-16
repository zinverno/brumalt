export let hostLanguage = 'ru';
export const getLanguage = (): string => hostLanguage;
export const setHostLanguage = (value: string): void => { hostLanguage = value; };
// Minimal host contract for DOM tests; this is not native Obsidian verification.
export function setIcon(parent: HTMLElement, name: string): void { parent.setAttribute('data-icon', name); }
export const notices: string[] = [];
export const noticeFragments: DocumentFragment[] = [];
export class Notice {
  constructor(message: string | DocumentFragment, _duration?: number) { if (typeof message !== 'string') noticeFragments.push(message); notices.push(typeof message === 'string' ? message : message.textContent ?? ''); }
  hide(): void {}
}
type Ref = { remove: () => void };
export class Component {
  cleanups: (() => void)[] = [];
  load(): void {}
  registerDomEvent(target: EventTarget, name: string, callback: EventListener): void {
    target.addEventListener(name, callback); this.cleanups.push(() => target.removeEventListener(name, callback));
  }
  registerEvent(ref: Ref): void { this.cleanups.push(() => ref.remove()); }
  unload(): void { this.cleanups.forEach(fn => fn()); this.cleanups = []; }
}
export class Modal {
  containerEl = document.createElement('div');
  bgEl = this.containerEl.appendChild(document.createElement('div'));
  closeButtonEl = this.containerEl.appendChild(document.createElement('div'));
  modalEl = this.containerEl.appendChild(document.createElement('div'));
  titleEl = this.modalEl.appendChild(document.createElement('div'));
  contentEl = this.modalEl.appendChild(document.createElement('div'));
  private previous: HTMLElement | null = null;
  private escape = (event: KeyboardEvent) => { if (event.key === 'Escape') this.close(); };
  constructor(public app: any) {
    this.containerEl.className = 'modal-container'; this.modalEl.className = 'modal';
    this.contentEl.className = 'modal-content'; this.bgEl.className = 'modal-bg';
    this.closeButtonEl.className = 'modal-close-button'; this.closeButtonEl.setAttribute('aria-label', 'Close');
    this.closeButtonEl.onclick = () => this.close(); this.bgEl.onclick = () => this.close();
  }
  open(): void {
    this.previous = document.activeElement as HTMLElement;
    document.body.appendChild(this.containerEl);
    document.addEventListener('keydown', this.escape); this.onOpen();
  }
  close(): void {
    if (!this.containerEl.isConnected) return;
    this.onClose(); document.removeEventListener('keydown', this.escape);
    this.containerEl.remove(); this.previous?.focus();
  }
  onOpen(): void {}
  onClose(): void {}
}
export class ItemView {
  async onClose(): Promise<void> {}
  app: any;
  containerEl: HTMLElement;
  contentEl: HTMLElement;
  cleanups: (() => void)[] = [];
  constructor(public leaf: any) {
    this.app = leaf.app;
    this.containerEl = document.createElement('div');
    this.contentEl = this.containerEl.appendChild(document.createElement('div'));
    document.body.appendChild(this.containerEl);
  }
  registerDomEvent(target: EventTarget, name: string, callback: EventListener): void {
    target.addEventListener(name, callback); this.cleanups.push(() => target.removeEventListener(name, callback));
  }
  registerEvent(ref: Ref): void { this.cleanups.push(() => ref.remove()); }
  unload(): void { this.cleanups.forEach(fn => fn()); this.cleanups = []; this.containerEl.remove(); }
}
export class Plugin {
  constructor(public app: any, public manifest: any) {}
  loadData(): Promise<unknown> { return Promise.resolve(this.app.disk); }
  async saveData(data: unknown): Promise<void> {
    this.app.saveAttempts = (this.app.saveAttempts ?? 0) + 1;
    if (this.app.saveGate) await this.app.saveGate;
    if (this.app.failSave) throw new Error('disk failure');
    this.app.writes++; this.app.disk = structuredClone(data);
  }
  registerView(type: string, factory: unknown): void { this.app.workspace.factories.set(type, factory); }
  addRibbonIcon(_icon: string, _title: string, action: () => void): HTMLElement { this.app.ribbon = action; return document.body.appendChild(document.createElement('button')); }
  addCommand(command: { id: string; name: string; callback: () => unknown }) { this.app.commands.set(command.id, command.callback); this.app.command = command; return command; }
  addSettingTab(tab: unknown): void { this.app.settingsTab = tab; }
}
export class PluginSettingTab {
  containerEl = document.createElement('div');
  constructor(_app: unknown, _plugin: unknown) {}
}
class Control {
  constructor(public inputEl: HTMLInputElement | HTMLSelectElement) {}
  addOptions(options: Record<string, string>): this {
    for (const [value, label] of Object.entries(options)) {
      const option = this.inputEl.appendChild(document.createElement('option')); option.value = value; option.textContent = label;
    }
    return this;
  }
  setValue(value: string | boolean): this {
    if (typeof value === 'boolean') (this.inputEl as HTMLInputElement).checked = value;
    else this.inputEl.value = value;
    return this;
  }
  setDisabled(value: boolean): this { this.inputEl.disabled = value; return this; }
  onChange(callback: (value: any) => void): this {
    this.inputEl.addEventListener('change', () => callback(this.inputEl.type === 'checkbox' ? (this.inputEl as HTMLInputElement).checked : this.inputEl.value)); return this;
  }
}
export class Setting {
  private row: HTMLElement;
  private name: HTMLElement;
  constructor(parent: HTMLElement) { this.row = parent.appendChild(document.createElement('label')); this.name = this.row.appendChild(document.createElement('span')); }
  setName(value: string): this { this.name.textContent = value; return this; }
  setDesc(value: string): this { this.row.appendChild(document.createElement('small')).textContent = value; return this; }
  private control(tag: 'input' | 'select', callback: (control: Control) => void, type?: string): this {
    const el = this.row.appendChild(document.createElement(tag));
    if (type) el.setAttribute('type', type); el.setAttribute('aria-label', this.name.textContent!);
    callback(new Control(el)); return this;
  }
  addDropdown(callback: (control: Control) => void): this { return this.control('select', callback); }
  addToggle(callback: (control: Control) => void): this { return this.control('input', callback, 'checkbox'); }
  addText(callback: (control: Control) => void): this { return this.control('input', callback, 'text'); }
}
