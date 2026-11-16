import { Component, getLanguage, Notice, Plugin, type Command } from 'obsidian';
import { count, resolveLanguage, t, type Key, type LanguageSetting } from './i18n';
import { midnightDelay, today } from './core/daily';
import { Reminders } from './core/reminders';
import { Store } from './core/storage';
import { loadWithLegacy } from './core/legacy-import';
import { GamesModal, VIEW_TYPE } from './ui/view';
import { LegacyGamesView } from './ui/legacy-view';
import { GamesSettings } from './ui/settings';
import type { AttemptRecord, Goal } from './core/types';

interface PendingResult {
  record: AttemptRecord;
  status: 'saving' | 'error';
  promise?: Promise<void>;
}

export default class Brumalt extends Plugin {
  store!: Store;
  get language() { return resolveLanguage(this.store?.data.settings.language ?? 'auto', (typeof getLanguage === 'function' ? getLanguage() : undefined) || globalThis.document?.documentElement.lang, globalThis.navigator?.language); }
  tr(key: Key, values?: Record<string, string | number>): string { return t(this.language, key, values); }
  async setLanguage(language: LanguageSetting): Promise<void> {
    if (this.store.loadError || this.store.configurationBusy || this.gameModal?.activeAttempt) return;
    const write = this.store.settings(settings => { settings.language = language; }); this.refreshViews();
    try { await write; this.registerGameCommand(); } catch { new Notice(this.tr('languageFailed')); }
    this.refreshViews();
  }
  private openCommand?: Command;
  private registerGameCommand(): void {
    if (this.openCommand) this.openCommand.name = this.tr('openGames');
    else this.openCommand = this.addCommand({ id: 'open-games', name: this.tr('openGames'), callback: () => this.openGames() });
  }
  readonly pendingResults = new Map<string, PendingResult>();
  durationChange: { minutes: 1 | 3 | 5; status: 'saving' | 'error' } | null = null;
  private durationWrite: Promise<void> | null = null;
  private durationNotice?: Notice;
  get minutes(): 1 | 3 | 5 { return this.durationChange?.minutes ?? this.store.data.settings.minutes; }
  private loaded = false;
  private dayTimer?: number;
  private readonly badgeEvents = new Component();
  private ribbon!: HTMLElement;
  private reminders?: Reminders;
  private reminderEvents?: Component;
  private reminderNotice?: Notice;
  gameModal: GamesModal | null = null;
  async onload(): Promise<void> {
    let imported = false;
    this.store = new Store({ read: async () => {
      const result = await loadWithLegacy({ adapter: this.app.vault.adapter, configDir: this.app.vault.configDir,
        readCurrent: () => this.loadData(), writeCurrent: data => this.saveData(data) });
      imported = result.imported; return result.data;
    }, write: data => this.saveData(data) });
    await this.store.load();
    if (this.store.loadError) new Notice(this.tr(this.store.loadError), 12000);
    else if (imported) new Notice(this.tr('importedLegacy'), 10000);
    this.registerView(VIEW_TYPE, leaf => new LegacyGamesView(leaf, this));
    this.ribbon = this.addRibbonIcon('brain', this.tr('title'), () => { void this.openGames(); });
    this.loaded = true;
    this.updateRibbon();
    this.badgeEvents.load();
    const doc = this.ribbon.ownerDocument;
    const refresh = () => { if (!doc.hidden) { this.updateRibbon(); this.gameModal?.refreshIdle(); this.scheduleDay(); } };
    this.badgeEvents.registerDomEvent(doc.defaultView!, 'focus', refresh);
    this.badgeEvents.registerDomEvent(doc, 'visibilitychange', refresh);
    this.syncReminders();
    this.registerGameCommand();
    this.addSettingTab(new GamesSettings(this.app, this));
  }
  openGames(): Promise<void> {
    if (!this.loaded) return Promise.resolve();
    this.reminderNotice?.hide();
    if (this.gameModal) { this.gameModal.focus(); return Promise.resolve(); }
    const modal = new GamesModal(this);
    this.gameModal = modal;
    try { modal.open(); }
    catch { modal.dispose(); this.gameModal = null; new Notice(this.tr('openFailed')); }
    return Promise.resolve();
  }
  modalClosed(modal: GamesModal): void {
    if (this.gameModal === modal) this.gameModal = null;
    this.reminders?.wake();
  }
  refreshViews(): void {
    if (!this.loaded) return;
    this.gameModal?.refreshIdle(); this.updateRibbon(); this.reminders?.wake();
  }
  private updateRibbon(): void {
    const state = today(this.store.data);
    this.ribbon.classList.toggle('cmg-goal-pending', !this.store.loadError && state.goal !== null && !state.complete);
    this.ribbon.setAttribute('aria-label', this.tr('title') + (state.goal !== null ? ' · ' + this.tr('todayProgress', { points: state.points, goal: state.goal }) : ''));
  }
  private scheduleDay(): void {
    const win = this.ribbon.ownerDocument.defaultView!;
    if (this.dayTimer !== undefined) win.clearTimeout(this.dayTimer);
    this.dayTimer = undefined;
    if (!this.loaded || this.reminders || this.store.loadError) return;
    this.dayTimer = win.setTimeout(() => {
      this.updateRibbon(); this.gameModal?.refreshIdle(); this.scheduleDay();
    }, midnightDelay(new Date()));
  }
  private stopReminders(): void {
    this.reminders?.stop(); this.reminders = undefined;
    this.reminderEvents?.unload(); this.reminderEvents = undefined;
    this.reminderNotice?.hide(); this.reminderNotice = undefined;
  }
  private syncReminders(): void {
    this.stopReminders();
    if (!this.loaded || this.store.loadError || !this.store.data.settings.reminder.enabled || this.store.data.settings.goal === null) { this.scheduleDay(); return; }
    const doc = this.ribbon.ownerDocument; const win = doc.defaultView!;
    this.reminders = new Reminders(this.store, {
      now: () => new Date(), available: () => !doc.hidden && doc.hasFocus() && !this.gameModal?.playing,
      setTimer: (fn, ms) => win.setTimeout(fn, ms), clearTimer: id => win.clearTimeout(id),
      changed: () => { this.updateRibbon(); this.gameModal?.refreshIdle(); },
      failed: () => { new Notice(this.tr('reminderMarkFailed')); },
      show: remaining => {
        const fragment = doc.createDocumentFragment();
        const message = doc.createElement('div'); message.className = 'cmg-reminder'; fragment.appendChild(message);
        message.createEl('p', { text: this.tr('reminder', { points: count(this.language, remaining, 'point') }) });
        const action = (label: string, fn: () => void) => { const b = message.createEl('button', { text: label }); b.onclick = fn; };
        action(this.tr('openGames'), () => { this.reminderNotice?.hide(); void this.openGames(); });
        action(this.tr('close'), () => this.reminderNotice?.hide());
        action(this.tr('disableReminders'), () => { void this.setReminder(false); });
        this.reminderNotice = new Notice(fragment, 0);
      },
    });
    this.reminderEvents = new Component(); this.reminderEvents.load();
    this.reminderEvents.registerDomEvent(win, 'focus', () => this.reminders?.wake());
    this.reminderEvents.registerDomEvent(doc, 'visibilitychange', () => { if (!doc.hidden) this.reminders?.wake(); });
    this.scheduleDay(); this.reminders.wake();
  }
  async setGoal(goal: Goal): Promise<void> {
    if (goal === null) this.stopReminders();
    try { await this.store.setGoal(goal); }
    catch { new Notice(this.tr('goalFailed')); }
    this.syncReminders(); this.refreshViews();
  }
  async setReminder(enabled: boolean, time?: string): Promise<void> {
    if (!enabled) this.stopReminders();
    try { await this.store.setReminder(enabled, time); }
    catch { new Notice(this.tr('reminderFailed')); }
    this.syncReminders(); this.refreshViews();
  }
  setMinutes(minutes: 1 | 3 | 5): Promise<void> {
    if (this.store.loadError) return Promise.resolve();
    if (this.durationChange?.minutes === minutes && this.durationWrite) return this.durationWrite;
    this.durationNotice?.hide();
    if (!this.durationWrite && minutes === this.store.data.settings.minutes) {
      this.durationChange = null; this.gameModal?.refreshDuration(); return Promise.resolve();
    }
    this.durationChange = { minutes, status: 'saving' };
    this.gameModal?.refreshDuration();
    if (this.durationWrite) return this.durationWrite;
    this.durationWrite = this.saveDuration().finally(() => {
      this.durationWrite = null; this.gameModal?.refreshDuration();
    });
    return this.durationWrite;
  }
  private async saveDuration(): Promise<void> {
    while (this.durationChange?.status === 'saving') {
      const minutes = this.durationChange.minutes;
      try {
        if (minutes !== this.store.data.settings.minutes) await this.store.setMinutes(minutes);
        if (this.durationChange.minutes === minutes) this.durationChange = null;
      } catch {
        if (this.durationChange?.minutes !== minutes) continue;
        this.durationChange.status = 'error';
        if (this.loaded) this.showDurationError();
      }
    }
  }
  private showDurationError(): void {
    const fragment = this.ribbon.ownerDocument.createDocumentFragment();
    const area = this.ribbon.ownerDocument.createElement('div'); area.className = 'cmg-reminder'; fragment.appendChild(area);
    area.createEl('p', { text: this.tr('durationFailed', { n: this.minutes }) });
    for (const [key, restore] of [['retryChoice', false], ['restoreDuration', true]] as const) {
      area.createEl('button', { text: this.tr(key) }).onclick = () => {
        if (this.loaded && this.durationChange?.status === 'error')
          void this.setMinutes(restore ? this.store.data.settings.minutes : this.minutes);
      };
    }
    this.durationNotice = new Notice(fragment, 10000);
  }
  saveResult(record: AttemptRecord): Promise<void> {
    const pending = this.pendingResults.get(record.id);
    if (pending?.promise) return pending.promise;
    if (this.store.data.history.some(saved => saved.id === record.id)) return Promise.resolve();
    const entry: PendingResult = pending ?? { record: structuredClone(record), status: 'saving' };
    entry.status = 'saving';
    this.pendingResults.set(record.id, entry);
    entry.promise = this.store.record(entry.record)
      .then(() => { this.pendingResults.delete(record.id); })
      .catch(() => {
        entry.status = 'error';
        new Notice(this.tr('saveFailed'), 12000);
      })
      .finally(() => { entry.promise = undefined; this.refreshViews(); });
    this.refreshViews();
    return entry.promise;
  }
  onunload(): void { this.loaded = false; this.durationNotice?.hide(); this.badgeEvents.unload(); this.stopReminders(); this.scheduleDay(); this.gameModal?.dispose(); }
}
