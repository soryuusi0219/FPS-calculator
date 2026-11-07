import { MAX_COMMENT_LENGTH, MAX_EQUATION_GROUPS, MAX_ROWS } from '../config/limits.ts';
import type { Calculation, EquationSystemInput, InputRow } from '../model/calculation.ts';

export type IdFactory = () => string;
export const newRow = (source = '', id: IdFactory = () => crypto.randomUUID()): InputRow => ({ id: id(), source });
export interface NotebookSnapshot { input: Calculation; selectedId: string }
type CalculationSetting = Exclude<keyof Calculation, 'rows' | 'systems'>;
const cloneInput = (input: Calculation): Calculation => ({ ...input, rows: input.rows.map((row) => ({ ...row })), ...(input.systems ? { systems: input.systems.map((system) => ({ ...system })) } : {}) });

/** 行順だけの変更では、IDに対応する係数結果をそのまま再利用できる。 */
export function calculationChanged(before: Calculation, after: Calculation): boolean {
  if (before.domain !== after.domain || before.basis !== after.basis || before.modulus !== after.modulus
    || !Object.is(before.terms, after.terms) || before.rows.length !== after.rows.length) return true;
  const sources = new Map(before.rows.map((row) => [row.id, row.source]));
  if (after.rows.some((row) => sources.get(row.id) !== row.source)) return true;
  const initial = new Map(before.rows.map((row) => [row.id, row.initial ?? '']));
  return after.rows.some((row) => initial.get(row.id) !== (row.initial ?? '')) || JSON.stringify(before.systems ?? []) !== JSON.stringify(after.systems ?? []);
}

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
  snapshot(): NotebookSnapshot { return { input: cloneInput(this.input), selectedId: this.selectedId }; }
  restore(snapshot: NotebookSnapshot): void {
    // session.inputが参照するCalculation自体は差し替えない。
    if (snapshot.input.systems === undefined) delete this.input.systems;
    Object.assign(this.input, cloneInput(snapshot.input));
    this.selectedId = snapshot.selectedId;
  }
  select(id: string): boolean {
    if (id === this.selectedId || !this.input.rows.some((row) => row.id === id)) return false;
    this.selectedId = id;
    return true;
  }
  updateSource(id: string, source: string): boolean {
    const row = this.input.rows.find((entry) => entry.id === id);
    if (!row || row.source === source) return false;
    row.source = source;
    return true;
  }
  updateSetting<K extends CalculationSetting>(key: K, value: Calculation[K]): boolean {
    if (Object.is(this.input[key], value)) return false;
    this.input[key] = value;
    return true;
  }
  updateInitial(id: string, initial: string): boolean {
    const row = this.input.rows.find((row) => row.id === id);
    if (!row || (row.initial ?? '') === initial) return false;
    if (initial) row.initial = initial; else delete row.initial;
    return true;
  }
  updateComment(id: string, comment: string): boolean {
    if(comment.length>MAX_COMMENT_LENGTH)throw new Error(`コメントは${MAX_COMMENT_LENGTH}文字までです。`);
    const row=this.input.rows.find(row=>row.id===id);
    if(!row||(row.comment??'')===comment)return false;
    if(comment)row.comment=comment;else delete row.comment;
    return true;
  }
  addSystem(): EquationSystemInput | undefined {
    if ((this.input.systems?.length ?? 0) >= MAX_EQUATION_GROUPS) return;
    const used = new Set([...this.input.rows.map((row) => /^\s*([A-Za-z_][A-Za-z_0-9]*)\s*=/.exec(row.source)?.[1]), ...(this.input.systems ?? []).flatMap((system) => [...system.variables.matchAll(/^\s*([A-Za-z_][A-Za-z_0-9]*)/gm)].map((match) => match[1]))]);
    let suffix = 1;
    while (used.has(suffix === 1 ? 'u' : `u${suffix}`) || used.has(suffix === 1 ? 'v' : `v${suffix}`)) suffix++;
    const u = suffix === 1 ? 'u' : `u${suffix}`; const v = suffix === 1 ? 'v' : `v${suffix}`;
    const system: EquationSystemInput = { id: this.id(), variables: `${u} = 1\n${v} = 1`, equations: `${u} = 1 + x*${v}\n${v} = 1 + x*${u}*${v}`, method: 'auto' };
    (this.input.systems ??= []).push(system); return system;
  }
  updateSystem<K extends 'variables' | 'equations' | 'method'>(id: string, key: K, value: EquationSystemInput[K]): boolean {
    const system = this.input.systems?.find((system) => system.id === id);
    if (!system || system[key] === value) return false;
    system[key] = value; return true;
  }
  removeSystem(id: string): boolean {
    const index = this.input.systems?.findIndex((system) => system.id === id) ?? -1;
    if (index < 0) return false;
    this.input.systems!.splice(index, 1); return true;
  }
  add(source = ''): InputRow | undefined {
    if (this.input.rows.length >= MAX_ROWS) return;
    const row = newRow(source, this.id);
    this.input.rows.push(row);
    this.selectedId = row.id;
    return row;
  }
  duplicate(id: string): InputRow | undefined {
    const index = this.input.rows.findIndex((row) => row.id === id);
    if (index < 0 || this.input.rows.length >= MAX_ROWS) return;
    const row = newRow(this.input.rows[index]!.source, this.id);
    if (this.input.rows[index]!.initial !== undefined) row.initial = this.input.rows[index]!.initial!;
    if (this.input.rows[index]!.comment !== undefined) row.comment = this.input.rows[index]!.comment!;
    this.input.rows.splice(index + 1, 0, row);
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
