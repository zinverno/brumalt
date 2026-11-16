import { localDay, reminderDelay, reminderDue, timeReached, today } from './daily';
import type { Store } from './storage';

export interface ReminderHost {
  now(): Date;
  available(): boolean;
  setTimer(callback: () => void, delay: number): number;
  clearTimer(id: number): void;
  show(remaining: number): void;
  changed(): void;
  failed(): void;
}
export class Reminders {
  private timer?: number;
  private busy = false;
  private again = false;
  private stopped = false;
  constructor(private readonly store: Store, private readonly host: ReminderHost) {}
  stop(): void {
    this.stopped = true;
    if (this.timer !== undefined) this.host.clearTimer(this.timer);
    this.timer = undefined;
  }
  wake(): void {
    if (this.stopped) return;
    this.host.changed();
    if (this.timer !== undefined) this.host.clearTimer(this.timer);
    this.timer = undefined;
    if (!this.store.data.settings.reminder.enabled || this.store.data.settings.goal === null || this.store.loadError) return;
    this.timer = this.host.setTimer(() => this.wake(), reminderDelay(this.store.data, this.host.now()));
    if (this.busy) { this.again = true; return; }
    if (!this.host.available() || !reminderDue(this.store.data, this.host.now())) return;
    this.busy = true;
    void this.check().finally(() => {
      this.busy = false;
      if (this.again) { this.again = false; this.wake(); }
    });
  }
  private async check(): Promise<void> {
    const now = this.host.now(); const day = localDay(now);
    const available = () => !this.stopped && this.host.available() && localDay(this.host.now()) === day;
    try {
      if (!await this.store.claimReminder(now, available)) return;
      const state = today(this.store.data, this.host.now());
      if (!available() || !this.store.data.settings.reminder.enabled || state.goal === null || state.complete || !timeReached(this.store.data.settings.reminder.time, this.host.now())) {
        await this.store.releaseReminder(day); return;
      }
      this.host.show(state.goal - state.points);
    } catch { if (!this.stopped) this.host.failed(); }
  }
}
