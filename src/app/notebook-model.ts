import { MAX_ROWS } from '../config/limits.ts';
import type { Calculation, InputRow } from '../model/calculation.ts';

export type IdFactory = () => string;
export const newRow = (source = '', id: IdFactory = () => crypto.randomUUID()): InputRow => ({ id: id(), source });

/** 行順と選択の規則。DOM、保存先、計算Workerには依存しない。 */
export class NotebookModel {
  readonly input: Calculation;
  selectedId: string;
  private readonly id: IdFactory;

  constructor(input: Calculation, id: IdFactory = () => crypto.randomUUID()) {
    if (input.rows.length === 0) throw new Error('計算ノートには1行以上必要です。');
    this.input = input;
    this.id = id;
    this.selectedId = input.rows[0]!.id;
  }
  get selectedRow(): InputRow { return this.input.rows.find((row) => row.id === this.selectedId)!; }
  select(id: string): boolean {
    if (id === this.selectedId || !this.input.rows.some((row) => row.id === id)) return false;
    this.selectedId = id;
    return true;
  }
  updateSource(id: string, source: string): void {
    const row = this.input.rows.find((entry) => entry.id === id);
    if (row) row.source = source;
  }
  add(source = ''): InputRow | undefined {
    if (this.input.rows.length >= MAX_ROWS) return;
    const row = newRow(source, this.id);
    this.input.rows.push(row);
    this.selectedId = row.id;
    return row;
  }
  remove(id: string): boolean {
    const index = this.input.rows.findIndex((row) => row.id === id);
    if (index < 0) return false;
    this.input.rows.splice(index, 1);
    if (!this.input.rows.length) this.input.rows.push(newRow('', this.id));
    if (this.selectedId === id) this.selectedId = this.input.rows[Math.min(index, this.input.rows.length - 1)]!.id;
    return true;
  }
  move(id: string, target: number): boolean {
    const index = this.input.rows.findIndex((row) => row.id === id);
    target = Math.max(0, Math.min(this.input.rows.length - 1, target));
    if (index < 0 || index === target || !Number.isInteger(target)) return false;
    const [row] = this.input.rows.splice(index, 1);
    this.input.rows.splice(target, 0, row!);
    return true;
  }
}
