import { HISTORY_MERGE_MS, MAX_HISTORY_ENTRIES } from '../config/limits.ts';

/** 呼出し側が所有権を渡したスナップショットを保持する。DOM・保存・計算には依存しない。 */
export class EditHistory<T> {
  private readonly past: T[] = [];
  private readonly future: T[] = [];
  private group: { key: string; time: number } | undefined;
  private readonly now: () => number;

  constructor(now: () => number = Date.now) { this.now = now; }

  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  breakGroup(): void { this.group = undefined; }

  record(before: T, key?: string): void {
    const time = this.now();
    const merge = key !== undefined && this.group?.key === key
      && time >= this.group.time && time - this.group.time < HISTORY_MERGE_MS;
    if (!merge) {
      this.past.push(before);
      if (this.past.length > MAX_HISTORY_ENTRIES) this.past.shift();
    }
    this.future.length = 0;
    this.group = key === undefined ? undefined : { key, time };
  }
  undo(current: T, adapt?: (current: T, target: T) => T): T | undefined {
    this.breakGroup();
    if (!this.canUndo) return;
    const target = this.past.pop()!;
    this.future.push(adapt ? adapt(current, target) : current);
    return target;
  }
  redo(current: T, adapt?: (current: T, target: T) => T): T | undefined {
    this.breakGroup();
    if (!this.canRedo) return;
    const target = this.future.pop()!;
    this.past.push(adapt ? adapt(current, target) : current);
    return target;
  }
}
