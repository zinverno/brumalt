import { ItemView, type WorkspaceLeaf } from 'obsidian';
import type Brumalt from '../main';
import { VIEW_TYPE } from './view';
import { button, text } from './dom';

// Keep the persisted 0.1.x view type readable without running a second game UI.
export class LegacyGamesView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private readonly plugin: Brumalt) { super(leaf); }
  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return this.plugin.tr('title'); }
  getIcon(): string { return 'brain'; }
  async onOpen(): Promise<void> {
    this.contentEl.empty(); this.contentEl.addClass('cmg-app');
    text(this.contentEl, this.plugin.tr('legacyView'));
    button(this.contentEl, this.plugin.tr('openGames'), () => { this.leaf.detach(); void this.plugin.openGames(); }, true);
  }
}
