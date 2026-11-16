import { Notice, PluginSettingTab, Setting, type App } from 'obsidian';
import type Brumalt from '../main';
import { GAME_IDS, type Goal, type SavedData } from '../core/types';
import { count, gameText, type LanguageSetting } from '../i18n';

export class GamesSettings extends PluginSettingTab {
  constructor(app: App, private readonly plugin: Brumalt) { super(app, plugin); }
  display(): void {
    const { containerEl } = this; const tr = this.plugin.tr.bind(this.plugin); const lang = this.plugin.language;
    containerEl.empty(); containerEl.lang = lang;
    containerEl.createEl('h2', { text: tr('title') });
    if (this.plugin.store.loadError) { containerEl.createEl('p', { text: tr(this.plugin.store.loadError) }); return; }
    const settings = this.plugin.store.data.settings;
    const pending = this.plugin.store.configurationBusy;
    const perform = async (write: Promise<void>) => { this.display(); await write; this.display(); };
    const save = async (change: (s: SavedData['settings']) => void) => {
      const write = this.plugin.store.settings(change); this.plugin.refreshViews();
      try { await write; } catch { new Notice(tr('settingsFailed')); }
      this.plugin.refreshViews(); this.display();
    };
    new Setting(containerEl).setName(tr('language')).setDesc(tr('languageHelp'))
      .addDropdown(dropdown => dropdown.addOptions({ auto: tr('autoLanguage'), en: tr('english'), ru: tr('russian') })
        .setValue(settings.language).setDisabled(pending || !!this.plugin.gameModal?.activeAttempt)
        .onChange(value => { void perform(this.plugin.setLanguage(value as LanguageSetting)); }));
    new Setting(containerEl).setName(tr('duration')).setDesc(tr('durationHelp'))
      .addDropdown(dropdown => dropdown.addOptions(Object.fromEntries([1, 3, 5].map(n => [n, tr('min', { n })])))
        .setValue(String(this.plugin.minutes)).setDisabled(pending)
        .onChange(value => { void perform(this.plugin.setMinutes(Number(value) as 1 | 3 | 5)); }));
    if (this.plugin.durationChange?.status === 'error') containerEl.createEl('p', { text: tr('durationRetry') });
    new Setting(containerEl).setName(tr('goalSetting')).setDesc(tr('goalSettingHelp'))
      .addDropdown(dropdown => dropdown.addOptions({ off: tr('goalOff'), ...Object.fromEntries([6, 9, 12].map(n => [n, count(lang, n, 'point')])) })
        .setValue(settings.goal === null ? 'off' : String(settings.goal)).setDisabled(pending)
        .onChange(value => { void perform(this.plugin.setGoal(value === 'off' ? null : Number(value) as Goal)); }));
    new Setting(containerEl).setName(tr('reminderSetting')).setDesc(tr('reminderSettingHelp'))
      .addToggle(toggle => toggle.setValue(settings.reminder.enabled).setDisabled(settings.goal === null || pending)
        .onChange(enabled => { void perform(this.plugin.setReminder(enabled)); }));
    new Setting(containerEl).setName(tr('timeSetting')).setDesc(tr('timeHelp'))
      .addText(input => {
        input.inputEl.type = 'time'; input.setValue(settings.reminder.time).setDisabled(pending)
          .onChange(value => { if (/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) void perform(this.plugin.setReminder(settings.reminder.enabled, value)); });
      });
    containerEl.createEl('h3', { text: tr('enabledGames') }); containerEl.createEl('p', { text: tr('enabledHelp') });
    for (const id of GAME_IDS) new Setting(containerEl).setName(gameText(lang, id, 'name'))
      .addToggle(toggle => toggle.setValue(settings.enabled.includes(id)).setDisabled(pending).onChange(async enabled => {
        if (!enabled && this.plugin.store.data.settings.enabled.length === 1 && this.plugin.store.data.settings.enabled.includes(id)) {
          new Notice(tr('keepGame')); this.display(); return;
        }
        await save(s => { s.enabled = enabled ? [...new Set([...s.enabled, id])] : s.enabled.filter(game => game !== id); });
      }));
    containerEl.createEl('p', { text: tr('settingsFooter') });
  }
}
