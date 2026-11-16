import { Notice, PluginSettingTab, type App, type SettingDefinitionItem } from 'obsidian';
import type Brumalt from '../main';
import { GAME_IDS } from '../core/types';
import { count, gameText } from '../i18n';

export class GamesSettings extends PluginSettingTab {
  constructor(app: App, private readonly plugin: Brumalt) { super(app, plugin); }
  getSettingDefinitions(): SettingDefinitionItem[] {
    const tr = this.plugin.tr.bind(this.plugin); const lang = this.plugin.language;
    this.containerEl.lang = lang;
    if (this.plugin.store.loadError) return [{ name: tr(this.plugin.store.loadError) }];
    const busy = () => this.plugin.store.configurationBusy;
    return [
      { type: 'group', heading: tr('generalSettings'), items: [
        { name: tr('language'), desc: tr('languageHelp'), control: { type: 'dropdown', key: 'language',
          options: { auto: tr('autoLanguage'), en: tr('english'), ru: tr('russian') }, disabled: () => busy() || !!this.plugin.gameModal?.activeAttempt } },
        { name: tr('duration'), desc: tr('durationHelp'), control: { type: 'dropdown', key: 'minutes',
          options: Object.fromEntries([1, 3, 5].map(n => [n, tr('min', { n })])) } },
        { name: tr('durationRetry'), visible: () => this.plugin.durationChange?.status === 'error' },
      ] },
      { type: 'group', heading: tr('dailySettings'), items: [
        { name: tr('goalSetting'), desc: tr('goalSettingHelp'), control: { type: 'dropdown', key: 'goal',
          options: { off: tr('goalOff'), ...Object.fromEntries([6, 9, 12].map(n => [n, count(lang, n, 'point')])) }, disabled: busy } },
        { name: tr('reminderSetting'), desc: tr('reminderSettingHelp'), control: { type: 'toggle', key: 'reminder',
          disabled: () => busy() || this.plugin.store.data.settings.goal === null } },
        { name: tr('timeSetting'), desc: tr('timeHelp'), visible: () => this.plugin.store.data.settings.reminder.enabled,
          control: { type: 'text', key: 'time', placeholder: '18:00', disabled: busy,
            validate: value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? undefined : tr('timeHelp') } },
      ] },
      { type: 'group', heading: tr('enabledGames'), items: GAME_IDS.map(id => ({
        name: gameText(lang, id, 'name'), desc: tr('enabledHelp'),
        control: { type: 'toggle', key: id, disabled: busy },
      })) },
      { name: tr('settingsFooter') },
    ];
  }
  getControlValue(key: string): unknown {
    const settings = this.plugin.store.data.settings;
    switch (key) {
      case 'language': return settings.language;
      case 'minutes': return String(this.plugin.minutes);
      case 'goal': return settings.goal === null ? 'off' : String(settings.goal);
      case 'reminder': return settings.reminder.enabled;
      case 'time': return settings.reminder.time;
      default: return settings.enabled.some(id => id === key);
    }
  }
  async setControlValue(key: string, value: unknown): Promise<void> {
    if (this.plugin.store.loadError) return;
    let write: Promise<void>;
    if (key === 'language' && (value === 'auto' || value === 'en' || value === 'ru')) write = this.plugin.setLanguage(value);
    else if (key === 'minutes' && (value === '1' || value === '3' || value === '5')) write = this.plugin.setMinutes(value === '1' ? 1 : value === '3' ? 3 : 5);
    else if (key === 'goal' && (value === 'off' || value === '6' || value === '9' || value === '12'))
      write = this.plugin.setGoal(value === 'off' ? null : value === '6' ? 6 : value === '9' ? 9 : 12);
    else if (key === 'reminder' && typeof value === 'boolean') write = this.plugin.setReminder(value);
    else if (key === 'time' && typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value))
      write = this.plugin.setReminder(this.plugin.store.data.settings.reminder.enabled, value);
    else {
      const game = GAME_IDS.find(id => id === key);
      if (!game || typeof value !== 'boolean') return;
      write = this.plugin.store.settings(settings => {
        // Check inside the transaction too: queued toggles must retain a playable game.
        if (!value && settings.enabled.length === 1 && settings.enabled.includes(game)) {
          new Notice(this.plugin.tr('keepGame')); return;
        }
        settings.enabled = value ? [...new Set([...settings.enabled, game])] : settings.enabled.filter(id => id !== game);
      });
    }
    this.refreshDomState(); this.plugin.refreshViews();
    try { await write; } catch { new Notice(this.plugin.tr('settingsFailed')); }
    finally { this.update(); this.refreshDomState(); this.plugin.refreshViews(); }
  }
}
