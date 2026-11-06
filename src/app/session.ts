import { MAX_EXPRESSION_LENGTH, MAX_NOTEBOOK_WIDTH, MAX_ROWS, MAX_TERMS, MIN_NOTEBOOK_WIDTH } from '../config/limits.ts';
import type { Calculation } from '../model/calculation.ts';
import type { IdFactory } from './notebook-model.ts';
import { newRow } from './notebook-model.ts';

export const STORAGE_KEY = 'fps-calculator:workbook:v1';
export type Presentation = 'table' | 'series';
export interface Session {
  input: Calculation;
  presentation: Presentation;
  notebookWidth: number | null;
}
export type SessionStorage = Pick<Storage, 'getItem' | 'setItem'>;
const examples = ['f = 1/(1-x)', 'g = exp(x)', 'h = revert(x-x^2)', 'compose(f, x+x^2)'];

export function defaultSession(id?: IdFactory): Session {
  return {
    input: { rows: examples.map((source) => newRow(source, id)), terms: 12, domain: 'rational', modulus: '998244353', basis: 'ogf' },
    presentation: 'table', notebookWidth: null,
  };
}

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object'; }

/** 従来のversion:1形式を読み、計算入力へ許可したフィールドだけを戻す。 */
export function restoreSession(storage: SessionStorage, id?: IdFactory): { session: Session; storageAvailable: boolean } {
  const fallback = defaultSession(id);
  try {
    const saved: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null');
    if (!record(saved) || saved.version !== 1 || !record(saved.data)) return { session: fallback, storageAvailable: true };
    const data = saved.data;
    if (!Array.isArray(data.rows) || data.rows.length < 1 || data.rows.length > MAX_ROWS
      || !data.rows.every((row: unknown) => record(row) && typeof row.source === 'string' && row.source.length <= MAX_EXPRESSION_LENGTH)
      || typeof data.terms !== 'number' || !Number.isInteger(data.terms) || data.terms < 1 || data.terms > MAX_TERMS
      || (data.domain !== 'rational' && data.domain !== 'prime') || (data.basis !== 'ogf' && data.basis !== 'egf')
      || typeof data.modulus !== 'string' || data.modulus.length > 10) return { session: fallback, storageAvailable: true };
    const width = saved.notebookWidth;
    return {
      session: {
        input: {
          rows: data.rows.map((row: { source: string }) => newRow(row.source, id)),
          terms: data.terms, domain: data.domain, basis: data.basis, modulus: data.modulus,
        },
        presentation: saved.view === 'series' ? 'series' : 'table',
        notebookWidth: typeof width === 'number' && Number.isFinite(width) && width >= MIN_NOTEBOOK_WIDTH && width <= MAX_NOTEBOOK_WIDTH ? width : null,
      },
      storageAvailable: true,
    };
  } catch { return { session: fallback, storageAvailable: false }; }
}

export function saveSession(storage: SessionStorage, session: Session): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data: session.input, view: session.presentation, notebookWidth: session.notebookWidth }));
    return true;
  } catch { return false; }
}
