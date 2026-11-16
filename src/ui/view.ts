import { Component, Modal, Notice } from 'obsidian';
import type Brumalt from '../main';
import { count, describe, displayText, gameText, locale, modeText, t, timeText, type Key } from '../i18n';
import { goalForDay, localDay, nextPoints, today, week } from '../core/daily';
import { Attempt } from '../core/attempt';
import { Session, planSession, replacement } from '../core/session';
import { GAME_IDS, isLogic, type Answer, type DisplayEnd, type GameId, type Mode } from '../core/types';
import { GAMES } from '../games';
import { exerciseProfile } from '../core/statistics';
import { button, icon, text } from './dom';
import { renderChallenge, renderFeedback } from './game-ui';
import { Navigation, type NavigationEvent } from './navigation';
import { renderRadar } from './radar';

export const VIEW_TYPE = 'casual-memory-games-view';
type ExitTarget = 'home' | 'finish' | 'close';
export class GamesModal extends Modal {
  private readonly navigation = new Navigation();
  get screen() { return this.navigation.current; }
  private exitTarget?: ExitTarget;
  private exitPanel?: HTMLElement;
  private returnFocus?: HTMLElement;
  private pausedAt?: number;
  private clockOffset = 0;
  private gameTime = () => (this.pausedAt ?? performance.now()) - this.clockOffset;
  private get lang() { return this.plugin.language; }
  private tr(key: Key, values?: Record<string, string | number>): string { return t(this.lang, key, values); }
  get activeAttempt(): boolean { return ['show', 'answer'].includes(this.attempt?.phase ?? ''); }
  private session?: Session;
  private attempt?: Attempt;
  private timers = new Map<number, { callback: () => void; due: number }>();
  private root!: HTMLElement;
  private live!: HTMLElement;
  private opened = false;
  private preferenceBusy = false;
  private preferenceError = false;
  private get saving(): boolean {
    return !!this.attempt?.record && this.plugin.pendingResults.get(this.attempt.record.id)?.status === 'saving';
  }
  private get saveError(): boolean {
    return !!this.attempt?.record && this.plugin.pendingResults.get(this.attempt.record.id)?.status === 'error';
  }
  private get saved(): boolean {
    return !!this.attempt?.record && this.plugin.store.data.history.some(r => r.id === this.attempt!.record!.id);
  }
  private get configurationBusy(): boolean { return this.preferenceBusy || this.plugin.store.configurationBusy; }
  private get attemptBlocked(): boolean { return this.configurationBusy || this.plugin.pendingResults.size > 0; }
  private get startBlocked(): boolean {
    return this.attemptBlocked;
  }
  private readonly events = new Component();
  constructor(private readonly plugin: Brumalt) { super(plugin.app); }
  focus(): void {
    if (this.exitPanel) { this.exitPanel.querySelector('button')?.focus(); return; }
    if (!this.modalEl.contains(this.contentEl.ownerDocument.activeElement))
      this.root.querySelector<HTMLElement>('h1, button')?.focus();
  }
  get playing(): boolean { return this.opened && (this.screen === 'GameSetup' || this.screen === 'GameActive'); }
  onOpen(): void {
    this.opened = true;
    this.containerEl.addClass('cmg-modal-container');
    this.modalEl.addClass('cmg-modal');
    this.titleEl.setText(this.tr('title')); this.titleEl.addClass('cmg-sr-only');
    this.modalEl.setAttribute('aria-label', this.tr('title'));
    this.events.load();
    this.contentEl.empty();
    this.live = this.contentEl.createDiv({ cls: 'cmg-sr-only', attr: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } });
    this.root = this.contentEl.createDiv({ cls: 'cmg-app' });
    const doc = this.contentEl.ownerDocument;
    const win = doc.defaultView!;
    this.events.registerDomEvent(doc, 'visibilitychange', () => { if (doc.hidden) this.interrupt(); });
    this.events.registerDomEvent(win, 'blur', () => this.interrupt());
    this.events.registerEvent(this.app.workspace.on('active-leaf-change', () => {
      this.interrupt();
    }));
    this.events.registerEvent(this.app.workspace.on('layout-change', () => {
      if (!this.contentEl.getBoundingClientRect().width) this.interrupt();
    }));
    this.render();
  }
  onClose(): void {
    this.stop(); this.events.unload(); this.contentEl.empty();
    this.plugin.modalClosed(this);
  }
  stop(): void {
    this.opened = false;
    this.dismissExit(false); this.clearTimers(); this.attempt?.interrupt();
  }
  refreshIdle(): void {
    if (this.opened && !this.exitTarget && !this.activeAttempt) this.render();
  }
  refreshDuration(): void {
    if (!this.opened || this.screen !== 'Home') return;
    const minutes = this.plugin.minutes;
    const failed = this.plugin.durationChange?.status === 'error';
    const group = this.root.querySelector<HTMLElement>('.cmg-duration');
    if (!group) return;
    group.classList.toggle('cmg-duration-unsaved', failed);
    for (const b of group.querySelectorAll<HTMLButtonElement>('button')) {
      const selected = Number(b.dataset.minutes) === minutes;
      b.setAttribute('aria-pressed', String(selected));
      b.title = selected && failed ? this.tr('durationRetry') : '';
    }
    const games = Math.min(minutes === 1 ? 1 : 3, this.plugin.store.data.settings.enabled.length);
    this.root.querySelector<HTMLElement>('.cmg-plan')?.setText(this.tr('plan', { games: count(this.lang, games, 'game'), n: minutes }));
    this.root.querySelector<HTMLElement>('.cmg-duration-status')?.setText(failed ? this.tr('durationRetry') : '');
  }
  private clearTimers(): void {
    const win = this.contentEl.ownerDocument.defaultView!;
    this.timers.forEach((_, id) => win.clearTimeout(id)); this.timers.clear();
  }
  private later(callback: () => void, ms: number): void {
    const win = this.contentEl.ownerDocument.defaultView!;
    const due = this.gameTime() + ms;
    const id = win.setTimeout(() => {
      this.timers.delete(id);
      if (!this.opened) return;
      if (this.gameTime() - due > 1500 || this.contentEl.ownerDocument.hidden) { this.interrupt(); return; }
      callback();
    }, ms);
    this.timers.set(id, { callback, due });
  }
  private interrupt(): void {
    if (!this.attempt?.interrupt()) return;
    this.dismissExit(false); this.clearTimers();
    this.navigate('prepare', false);
  }
  private navigate(event: NavigationEvent, focus = true): void {
    if (!this.opened || !this.navigation.send(event)) return;
    if (event === 'home') {
      this.clearTimers(); this.attempt?.interrupt(); this.attempt = undefined; this.session = undefined;
      this.preferenceError = false;
    }
    this.render(focus);
    if (event === 'home' || event === 'finish') this.plugin.refreshViews();
  }
  private openProgress(): void { this.navigate('progress'); }
  close(): void {
    if (this.exitTarget) { this.dismissExit(true); return; }
    this.requestExit('close');
  }
  dispose(): void { this.stop(); super.close(); }
  private requestExit(target: ExitTarget): void {
    if (!this.activeAttempt) { this.leave(target); return; }
    if (this.exitTarget) return;
    this.exitTarget = target; this.pausedAt = performance.now();
    this.timers.forEach((_, id) => this.contentEl.ownerDocument.defaultView!.clearTimeout(id));
    this.returnFocus = this.contentEl.ownerDocument.activeElement as HTMLElement;
    this.root.hidden = true; this.root.inert = true;
    const id = 'cmg-exit-' + crypto.randomUUID();
    const panel = this.contentEl.createDiv({ cls: 'cmg-app cmg-exit-panel', attr: { role: 'alertdialog', 'aria-labelledby': id, 'aria-describedby': id + '-detail' } });
    this.exitPanel = panel; panel.lang = this.lang;
    panel.createEl('h2', { text: this.tr('leaveTitle'), attr: { id } });
    panel.createEl('p', { text: this.tr('leaveDetail'), cls: 'cmg-muted', attr: { id: id + '-detail' } });
    const actions = panel.createDiv({ cls: 'cmg-actions' });
    button(actions, this.tr('stay'), () => { if (this.exitPanel === panel) this.dismissExit(true); }, true).focus();
    button(actions, this.tr(target === 'close' ? 'cancelClose' : target === 'finish' ? 'cancelFinish' : 'cancelReturn'), () => { if (this.exitPanel === panel) this.leave(target); }).addClass('cmg-quiet');
  }
  private dismissExit(resume: boolean): void {
    if (!this.exitTarget) return;
    const scheduled = [...this.timers.values()]; this.clearTimers();
    this.clockOffset += performance.now() - this.pausedAt!; this.pausedAt = undefined;
    this.exitTarget = undefined; this.exitPanel?.remove(); this.exitPanel = undefined;
    this.root.hidden = false; this.root.inert = false;
    if (resume) {
      for (const task of scheduled) this.later(task.callback, Math.max(0, task.due - this.gameTime()));
      if (this.returnFocus && this.root.contains(this.returnFocus)) this.returnFocus.focus();
      else this.focus();
    }
    this.returnFocus = undefined;
  }
  private leave(target: ExitTarget): void {
    this.dismissExit(false); this.clearTimers(); this.attempt?.interrupt();
    if (target === 'close') { super.close(); return; }
    if (target === 'finish') this.attempt = undefined;
    this.navigate(target);
  }
  private header(title: string, back?: () => void, progress = false): void {
    const nav = this.root.createDiv({ cls: 'cmg-header' });
    if (back) { const b = button(nav, this.tr('back'), back); b.addClass('cmg-quiet', 'cmg-back'); icon(b, 'arrow-left'); }
    nav.createEl('h1', { text: title, attr: { tabindex: '-1' } });
    const actions = nav.createDiv({ cls: 'cmg-header-actions' });
    if (progress) { const b = button(actions, this.tr('progress'), () => this.openProgress()); b.addClass('cmg-quiet'); icon(b, 'chart-no-axes-column'); b.title = this.tr('progress'); }
  }
  private render(focus = true): void {
    if (!this.opened) return;
    this.root.empty();
    this.root.dataset.screen = this.screen;
    this.root.classList.toggle('cmg-progress-screen', this.screen === 'Progress');
    this.root.lang = this.lang; this.titleEl.setText(this.tr('title'));
    this.modalEl.setAttribute('aria-label', this.tr('title'));
    if (this.plugin.store.loadError) {
      this.header(this.tr('loadTitle'));
      text(this.root, this.tr(this.plugin.store.loadError));
      text(this.root, this.tr('dataPath', { path: `${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}/data.json` }));
      button(this.root, this.tr('backNotes'), () => this.close(), true); return;
    }
    for (const pending of this.plugin.pendingResults.values()) {
      if (pending.record.id === this.attempt?.record?.id && (this.screen === 'GameSetup' || this.screen === 'GameActive')) continue;
      const banner = this.root.createDiv({ cls: 'cmg-message', attr: { role: 'status' } });
      text(banner, `${gameText(this.lang, pending.record.game, 'name')} · ${pending.record.correct}/${pending.record.total}`);
      text(banner, this.tr(pending.status === 'saving' ? 'saving' : 'pending'));
      if (pending.status === 'error') button(banner, this.tr('retry'), () => { void this.plugin.saveResult(pending.record); }, true);
    }
    switch (this.screen) {
      case 'Home': this.home(); break;
      case 'GameSetup': case 'GameActive': this.game(); break;
      case 'SessionResult': this.summary(); break;
      case 'Progress': this.progress(); break;
    }
    if (focus && this.opened) {
      const target = this.root.querySelector<HTMLElement>('[data-autofocus]') ?? this.root.querySelector<HTMLElement>('h1');
      target?.focus({ preventScroll: true });
    }
  }
  private home(): void {
    this.header(this.tr('title'), undefined, true);
    const hero = this.root.createDiv({ cls: 'cmg-hero' });
    button(hero, this.tr('play'), () => this.startSession(), true).disabled = this.startBlocked;
    const statusId = 'cmg-duration-' + crypto.randomUUID();
    const duration = hero.createDiv({ cls: 'cmg-duration', attr: { role: 'group', 'aria-label': this.tr('duration'), 'aria-describedby': statusId } });
    for (const minutes of [1, 3, 5] as const) {
      const b = button(duration, this.tr('min', { n: minutes }), () => { void this.plugin.setMinutes(minutes); });
      b.disabled = this.configurationBusy;
      b.dataset.minutes = String(minutes);
    }
    text(hero, '', 'cmg-caption cmg-plan');
    hero.createSpan({ cls: 'cmg-sr-only cmg-duration-status', attr: { id: statusId, role: 'status' } });
    this.refreshDuration();
    this.daily();
    const cards = this.root.createDiv({ cls: 'cmg-cards', attr: { 'aria-label': this.tr('games') } });
    const state = today(this.plugin.store.data);
    const entry = this.plugin.store.data.daily.days.find(day => day.day === state.day);
    for (const id of GAME_IDS) {
      const def = GAMES[id];
      const card = button(cards, '', () => this.startSession(id)); card.addClass('cmg-card'); card.setAttribute('data-game', id);
      card.disabled = this.startBlocked;
      const top = card.createSpan({ cls: 'cmg-card-top' }); icon(top, def.icon);
      if (state.goal !== null && !state.complete) {
        const n = nextPoints(entry, id);
        const chip = top.createSpan({ text: n ? `+${n}` : '✓', cls: 'cmg-chip', attr: { 'aria-label': this.tr(n ? 'cardPoints' : 'cardDone', { n }) } });
        chip.title = this.tr(n ? 'cardPoints' : 'cardDone', { n });
      }
      card.createEl('strong', { text: gameText(this.lang, id, 'name') });
      card.createSpan({ text: describe(this.lang, id, def.parameters(this.currentLevel(id, true)), true), cls: 'cmg-caption' });
    }
    this.weekly();
  }
  private startSession(freeGame?: GameId, origin: 'Home' | 'SessionResult' = 'Home'): void {
    if (!this.opened || this.startBlocked || this.screen !== origin) return;
    this.clearTimers();
    const { settings, history } = this.plugin.store.data;
    this.session = new Session(freeGame ? [freeGame] : planSession(settings.enabled, this.plugin.minutes, history), this.plugin.minutes, !!freeGame);
    this.attempt = undefined; this.preferenceError = false;
    this.navigate('prepare');
  }
  private currentLevel(game: GameId, free: boolean): number {
    const data = this.plugin.store.data;
    return free && data.settings.practice[game].manual ? data.settings.practice[game].level : data.adaptive[game].level;
  }
  private difficulty(parent: HTMLElement): void {
    const session = this.session!;
    const id = session.game;
    const level = this.currentLevel(id, session.free);
    const pref = this.plugin.store.data.settings.practice[id];
    text(parent, `${this.tr('level', { n: level })} · ${describe(this.lang, id, GAMES[id].parameters(level))}`, 'cmg-level');
    if (!session.free && session.inBlock > 0) return;
    const controls = parent.createDiv({ cls: 'cmg-difficulty' });
    const change = (nextLevel: number, manual = true) => {
      if (!this.opened || this.activeAttempt || this.exitTarget || this.session !== session || this.configurationBusy || this.plugin.pendingResults.size) return;
      this.preferenceBusy = true; this.preferenceError = false;
      const write = session.free
        ? this.plugin.store.settings(s => { s.practice[id] = { manual, level: nextLevel }; })
        : this.plugin.store.setAdaptiveLevel(id, nextLevel);
      this.render();
      void write.catch(() => {
        this.preferenceError = true;
        new Notice(this.tr('levelFailed'));
      }).finally(() => { this.preferenceBusy = false; this.plugin.refreshViews(); });
    };
    const disabled = this.configurationBusy || this.plugin.pendingResults.size > 0;
    button(controls, this.tr('easier'), () => change(level - 1)).disabled = level <= 1 || disabled;
    button(controls, this.tr('harder'), () => change(level + 1)).disabled = level >= GAMES[id].maxLevel || disabled;
    if (session.free && pref.manual) button(controls, this.tr('auto'), () => change(level, false)).disabled = disabled;
    const mode = controls.createSpan({ text: this.tr(session.free && pref.manual ? 'manual' : 'auto'), cls: 'cmg-chip' });
    mode.title = this.tr(session.free && pref.manual ? 'manualHelp' : 'autoHelp');
    if (this.configurationBusy) text(parent, this.tr('saving'), 'cmg-caption');
    if (this.preferenceError) text(parent, this.tr('levelFailed'), 'cmg-message');
  }
  private game(): void {
    const session = this.session!;
    const id = session.game;
    this.header(gameText(this.lang, id, 'name'), () => this.requestExit('home'));
    const top = this.root.createDiv({ cls: 'cmg-mode-row' });
    text(top, session.free ? this.tr('free') : this.tr('stage', { n: session.index + 1, total: session.plan.length }), 'cmg-eyebrow');
    if (this.screen === 'GameActive' || session.records.length) button(top, this.tr('finish'), () => this.requestExit('finish')).disabled = this.saving || this.saveError || this.configurationBusy;
    const phase = this.attempt?.phase ?? 'preparation';
    const area = this.root.createDiv({ cls: 'cmg-play-area', attr: { 'data-phase': phase } });
    if (phase === 'preparation' || phase === 'interrupted') {
      if (phase === 'interrupted') {
        text(area, this.tr('interrupted'), 'cmg-message');
      }
      text(area, gameText(this.lang, id, 'rule'), 'cmg-instruction');
      this.difficulty(area);
      const actions = area.createDiv({ cls: 'cmg-actions' });
      button(actions, this.tr(phase === 'interrupted' ? 'resume' : 'start'), () => { if (this.screen === 'GameSetup') this.startAttempt(); }, true).disabled = this.attemptBlocked;
      const candidate = replacement(session.plan, this.plugin.store.data.settings.enabled, this.plugin.store.data.history, Math.random, session.index);
      if (!session.free && !session.inBlock && phase === 'preparation' && candidate) button(actions, this.tr('replace'), () => {
        if (this.configurationBusy) return;
        session.plan[session.index] = candidate; this.attempt = undefined; this.render();
      }).disabled = this.configurationBusy;
    } else if (phase === 'show' || phase === 'answer') {
      const label = this.tr(phase === 'show' ? 'remember' : 'answer');
      text(area, label, 'cmg-eyebrow');
      if (phase === 'show') text(area, this.tr('showTime', { time: timeText(this.lang, this.attempt!.challenge.params.showMs) }), 'cmg-caption');
      const currentAttempt = this.attempt!;
      renderChallenge(area, currentAttempt, answer => { if (this.attempt === currentAttempt) this.finish(answer); }, (fn, ms) => this.later(fn, ms), this.lang);
      if (phase === 'show' && id !== 'sequence') {
        const attempt = this.attempt!;
        button(area, this.tr('ready'), () => this.recall(attempt, 'ready')).addClass('cmg-ready');
      }
    } else if (phase === 'result') {
      const record = this.attempt!.record!;
      text(area, this.tr(record.correct === record.total ? 'correct' : 'completed'), 'cmg-result-title');
      text(area, this.tr('score', { correct: record.correct, total: record.total, time: timeText(this.lang, record.responseMs) }), 'cmg-score');
      renderFeedback(area, this.attempt!, this.lang);
      text(area, displayText(this.lang, record.displayEnd) + (record.displayEnd === 'visible' ? '' : ` · ${timeText(this.lang, record.displayMs)}`), 'cmg-caption');
      if (this.saved && today(this.plugin.store.data).complete) text(area, this.tr('goalComplete'), 'cmg-caption');
      text(area, this.tr(this.saving ? 'saving' : this.saveError ? 'saveFailed' : 'saved'), 'cmg-save-status');
      if (this.saveError) button(area, this.tr('retry'), () => { void this.persist(); }, true);
      if (this.saved) {
        if (session.free) this.difficulty(area);
        button(area, this.tr(session.free ? 'nextAttempt' : 'next'), () => this.next(), true).disabled = this.configurationBusy;
      }
    }
    const hint = this.root.createEl('details', { cls: 'cmg-hint' });
    hint.createEl('summary', { text: this.tr('hint') }); text(hint, gameText(this.lang, id, 'hint'));
  }
  private startAttempt(): void {
    if (!this.opened || this.exitTarget || this.attemptBlocked || this.activeAttempt || !['GameSetup', 'GameActive'].includes(this.screen)) return;
    if (this.contentEl.ownerDocument.hidden) return;
    this.clearTimers();
    const session = this.session!;
    const id = session.game;
    const def = GAMES[id];
    const mode: Mode = !session.free ? 'session-adaptive' : this.plugin.store.data.settings.practice[id].manual ? 'free-manual' : 'free-adaptive';
    this.attempt = new Attempt(crypto.randomUUID(), def.generate(this.currentLevel(id, session.free), Math.random, this.lang), mode, def, this.gameTime);
    this.attempt.show();
    this.live.setText(`${this.tr(isLogic(id) ? 'answer' : 'remember')} · ${gameText(this.lang, id, 'name')}`);
    this.navigate('start');
    const attempt = this.attempt;
    if (!isLogic(id)) this.later(() => this.recall(attempt, 'timer'), attempt.challenge.params.showMs);
  }
  private recall(attempt: Attempt, displayEnd: DisplayEnd): void {
    if (this.contentEl.ownerDocument.hidden || !this.opened) { this.interrupt(); return; }
    if (this.exitTarget || attempt !== this.attempt || !attempt.recall(displayEnd)) return;
    this.clearTimers(); this.live.setText(this.tr('answer')); this.render();
  }
  private finish(answer: Answer): void {
    if (this.exitTarget || this.screen !== 'GameActive') return;
    if (this.contentEl.ownerDocument.hidden || !this.opened) { this.interrupt(); return; }
    const now = new Date();
    const data = this.plugin.store.data;
    const record = this.attempt?.finish(answer, now.toISOString(), data.settings.goal === null ? null : goalForDay(data, localDay(now)));
    if (!record) return;
    this.clearTimers(); this.session!.add(record);
    this.live.setText(this.tr('resultLive', { correct: record.correct, total: record.total }));
    void this.persist();
  }
  private persist(): Promise<void> {
    return this.attempt?.record ? this.plugin.saveResult(this.attempt.record) : Promise.resolve();
  }
  private next(): void {
    if (!this.saved || this.configurationBusy) return;
    const next = this.session!.advance();
    if (next === 'end') this.end();
    else if (next === 'block') { this.attempt = undefined; this.navigate('prepare'); }
    else this.startAttempt();
  }
  private end(): void {
    if (this.saving || this.saveError || this.configurationBusy) return;
    this.leave('finish');
  }
  private summary(): void {
    const records = this.session?.records ?? [];
    this.header(this.tr(records.length ? 'summary' : 'summaryEmpty'), () => this.requestExit('home'));
    text(this.root, records.length ? this.tr('summarySaved', { count: count(this.lang, records.length, 'attempt') }) : this.tr('noAttempts'), 'cmg-caption');
    for (const game of GAME_IDS) {
      const played = records.filter(r => r.game === game); if (!played.length) continue;
      const row = this.root.createDiv({ cls: 'cmg-summary-row' }); icon(row, GAMES[game].icon);
      row.createEl('strong', { text: gameText(this.lang, game, 'name') });
      text(row, this.tr('perfect', { n: played.filter(r => r.correct === r.total).length, total: played.length }), 'cmg-caption');
    }
    this.daily(); this.weekly();
    if (records.length && !this.plugin.store.data.daily.reminderOffered && this.plugin.store.data.settings.goal !== null) {
      const offer = this.root.createDiv({ cls: 'cmg-reminder-offer' });
      const copy = offer.createDiv(); text(copy, this.tr('reminderOffer'));
      text(copy, this.tr('reminderTime', { time: this.plugin.store.data.settings.reminder.time }), 'cmg-caption');
      const choices = offer.createDiv({ cls: 'cmg-actions' });
      button(choices, this.tr('remindMe'), () => { void this.plugin.setReminder(true); }).disabled = this.configurationBusy;
      button(choices, this.tr('notNow'), () => { void this.plugin.store.offerReminder().catch(() => new Notice(this.tr('choiceFailed'))).finally(() => this.refreshIdle()); }).addClass('cmg-quiet');
    }
    const actions = this.root.createDiv({ cls: 'cmg-summary-actions' });
    button(actions, this.tr('backNotes'), () => this.close(), true);
    button(actions, this.tr('again'), () => this.startSession(this.session?.free ? this.session.plan[0] : undefined, 'SessionResult')).addClass('cmg-secondary');
    actions.querySelector<HTMLButtonElement>('.cmg-secondary')!.disabled = this.startBlocked;
    button(actions, this.tr('returnHome'), () => this.requestExit('home')).addClass('cmg-quiet');
  }
  private daily(compact = false): void {
    const state = today(this.plugin.store.data);
    const area = this.root.createDiv({ cls: 'cmg-daily' });
    const row = area.createDiv({ cls: 'cmg-daily-heading' });
    const label = state.goal === null ? this.tr('today') + ': ' + count(this.lang, state.count, 'attempt') : this.tr('todayProgress', { points: state.points, goal: state.goal });
    row.createEl('strong', { text: label });
    const details = row.createEl('details', { cls: 'cmg-goal-info' });
    const toggle = details.createEl('summary', { text: '?', attr: { 'aria-label': this.tr('goalSetting') } }); toggle.title = this.tr('goalSetting');
    const copy = details.createDiv({ cls: 'cmg-goal-explanation' }); text(copy, this.tr('pointsHelp'));
    if (state.legacy) text(copy, this.tr(state.legacy.credited ? 'legacyIncluded' : 'legacyUnknown'));
    if (state.goal !== null) area.createEl('progress', { cls: 'cmg-daily-bar', attr: { max: String(state.goal), value: String(Math.min(state.points, state.goal)), 'aria-label': label + ' · ' + count(this.lang, state.points, 'point') } });
    if (!compact || state.complete) text(area, this.tr(state.goal === null ? 'goalOff' : state.complete ? 'goalComplete' : 'variety'), 'cmg-caption');
  }
  private weekly(): void {
    const section = this.root.createDiv({ cls: 'cmg-weekly' }); text(section, this.tr('week'), 'cmg-caption');
    const days = section.createDiv({ cls: 'cmg-week', attr: { role: 'list', 'aria-label': this.tr('weekLabel') } });
    const symbols = { unknown: '·', empty: '—', partial: '◐', complete: '✓', legacy: '○' };
    const keys = { unknown: 'dayUnknown', empty: 'dayEmpty', partial: 'dayPartial', complete: 'dayComplete', legacy: 'legacyDay' } as const;
    week(this.plugin.store.data).forEach(day => {
      const date = new Date(day.day + 'T12:00:00');
      const dateText = date.toLocaleDateString(locale(this.lang), { weekday: 'long', month: 'short', day: 'numeric' });
      let label: string;
      if (day.status === 'legacy') label = this.tr('legacyDay', { date: dateText, attempts: count(this.lang, day.legacy!.count, 'attempt'), goal: day.legacy!.goal === null ? this.tr('legacyOff') : count(this.lang, day.legacy!.goal, 'attempt') });
      else if (day.status === 'unknown') label = `${dateText} · ${this.tr('dayUnknown')}`;
      else label = this.tr(day.goal === null ? 'dayNoGoal' : 'dayDetails', { date: dateText, status: this.tr(keys[day.status]), points: day.points, goal: day.goal ?? '', attempts: count(this.lang, day.count, 'attempt') });
      if (day.legacy && !day.legacy.credited && day.status !== 'legacy') label += '\n' + this.tr('legacyExtra', { attempts: count(this.lang, day.legacy.count, 'attempt') });
      const tipId = 'cmg-day-' + crypto.randomUUID();
      const item = days.createDiv({ cls: `cmg-day cmg-day-${day.status}`, attr: { role: 'listitem', tabindex: '0', 'aria-label': dateText, 'aria-describedby': tipId } });
      item.createSpan({ text: date.toLocaleDateString(locale(this.lang), { weekday: 'short' }), attr: { 'aria-hidden': 'true' } });
      item.createEl('strong', { text: symbols[day.status], attr: { 'aria-hidden': 'true' } });
      item.createSpan({ text: label, cls: 'cmg-tooltip', attr: { id: tipId, role: 'tooltip' } });
    });
  }
  private progress(): void {
    this.header(this.tr('progress'), () => this.requestExit('home'));
    this.daily(true); this.weekly();
    const profile = exerciseProfile(this.plugin.store.data.history);
    renderRadar(this.root, profile, this.lang);
    const games = this.root.createDiv({ cls: 'cmg-progress-list' });
    for (const entry of profile) {
      const { game, played, target, stats, score } = entry;
      const level = this.plugin.store.data.adaptive[game].level;
      const section = games.createEl('details', { cls: 'cmg-progress-card' });
      const head = section.createEl('summary', { cls: 'cmg-game-row', attr: { 'aria-label': `${gameText(this.lang, game, 'name')} · ${this.tr('level', { n: level })} · ${score === null ? this.tr('profileNoData') : this.tr('profileScore', { n: score })} · ${this.tr('history')}` } });
      icon(head, GAMES[game].icon);
      head.createEl('strong', { text: gameText(this.lang, game, 'name') });
      head.createSpan({ text: this.tr('levelShort', { n: level }), cls: 'cmg-chip' });
      head.createSpan({ text: score === null ? '—' : String(score), cls: 'cmg-profile-value' });
      if (!target || !stats) { text(section, this.tr('noResults'), 'cmg-caption'); continue; }
      const context = `${describe(this.lang, game, target.params)} · ${modeText(this.lang, target.mode)} · ${displayText(this.lang, target.displayEnd)}`;
      text(section, context + (target.materialLanguage ? ` · ${this.tr(target.materialLanguage === 'en' ? 'english' : 'russian')}` : ''), 'cmg-caption');
      text(section, this.tr('perfect', { n: stats.successes, total: stats.recent.length }), 'cmg-caption');
      if (stats.bestMs !== null) text(section, this.tr('best', { time: timeText(this.lang, stats.bestMs) }), 'cmg-caption');
      const list = section.createEl('ul', { cls: 'cmg-history', attr: { 'aria-label': this.tr('history') } });
      for (const r of played.slice(-10).reverse()) {
        const item = list.createEl('li'); item.createEl('strong', { text: `${r.correct}/${r.total} · ${new Date(r.at).toLocaleString(locale(this.lang))}` });
        text(item, `${describe(this.lang, game, r.params)} · ${this.tr('recordContext', { mode: modeText(this.lang, r.mode), level: this.tr('level', { n: r.level }), display: displayText(this.lang, r.displayEnd), version: r.rulesVersion })}`, 'cmg-caption');
        text(item, this.tr('recordTimes', { show: timeText(this.lang, r.displayMs), response: timeText(this.lang, r.responseMs) }) + (r.materialLanguage ? ` · ${this.tr(r.materialLanguage === 'en' ? 'english' : 'russian')}` : ''), 'cmg-caption');
      }
    }
    const about = this.root.createEl('details', { cls: 'cmg-profile-about' });
    about.createEl('summary', { text: this.tr('profileAbout') });
    text(about, this.tr('profileHelp'), 'cmg-caption');
    text(about, this.tr('statsNote'), 'cmg-caption');
  }
}
