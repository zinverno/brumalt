import type { SettingDefinitionItem, SettingDefinitionControl } from 'obsidian';
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
  addSettingTab(tab: PluginSettingTab): void { this.app.settingsTab = tab; tab.update(); }
}
export class PluginSettingTab {
  containerEl = document.createElement('div');
  settingItems: SettingDefinitionItem[] = [];
  private bindings: { def: SettingDefinitionControl; row: HTMLElement; input: HTMLInputElement | HTMLSelectElement }[] = [];
  constructor(_app: unknown, _plugin: unknown) {}
  getSettingDefinitions(): SettingDefinitionItem[] { return []; }
  getControlValue(_key: string): unknown { return undefined; }
  async setControlValue(_key: string, _value: unknown): Promise<void> {}
  update(): void {
    this.settingItems = this.getSettingDefinitions(); this.containerEl.replaceChildren(); this.bindings = [];
    const render = (items: SettingDefinitionItem[]) => {
      for (const def of items) {
        if ('type' in def) {
          if (def.type === 'group' || def.type === 'list') {
            if (def.heading) this.containerEl.createDiv({ text: def.heading, cls: 'setting-item-heading' });
            render(def.items ?? []);
          }
          continue;
        }
        const row = this.containerEl.createDiv(); row.createSpan({ text: def.name });
        if (typeof def.desc === 'string') row.createEl('small', { text: def.desc });
        if (def.control) {
          const control = def.control;
          const input = row.createEl(control.type === 'dropdown' ? 'select' : 'input');
          input.setAttribute('aria-label', def.name);
          if (control.type === 'dropdown') for (const [value, label] of Object.entries(control.options)) {
            const option = input.createEl('option', { text: label }); option.value = value;
          }
          if (control.type === 'toggle') { (input as HTMLInputElement).type = 'checkbox'; (input as HTMLInputElement).checked = !!this.getControlValue(control.key); }
          else input.value = String(this.getControlValue(control.key) ?? '');
          input.addEventListener('change', () => {
            const value = control.type === 'toggle' ? (input as HTMLInputElement).checked : input.value;
            void this.setControlValue(control.key, value);
          });
          this.bindings.push({ def: def as SettingDefinitionControl, row, input });
        } else if (def.render) def.render(new Setting(row) as never, {} as never);
        row.hidden = typeof def.visible === 'function' ? !def.visible() : def.visible === false;
      }
    };
    render(this.settingItems); this.refreshDomState();
  }
  refreshDomState(): void {
    for (const { def, row, input } of this.bindings) {
      const disabled = def.control.disabled;
      input.disabled = typeof disabled === 'function' ? disabled() : !!disabled;
      row.hidden = typeof def.visible === 'function' ? !def.visible() : def.visible === false;
    }
  }
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
