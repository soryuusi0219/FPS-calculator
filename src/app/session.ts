import { decodeNotebook } from './notebook-document.ts';
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

/** 既存の保存形式を共通の検証器で読み、破損時は編集用ノートへ戻す。 */
export function restoreSession(storage: SessionStorage, id?: IdFactory): { session: Session; storageAvailable: boolean } {
  const fallback = defaultSession(id);
  try {
    const value: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null');
    try { return { session: decodeNotebook(value, id), storageAvailable: true }; }
    catch { return { session: fallback, storageAvailable: true }; }
  } catch { return { session: fallback, storageAvailable: false }; }
}

export function saveSession(storage: SessionStorage, session: Session): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data: session.input, view: session.presentation, notebookWidth: session.notebookWidth }));
    return true;
  } catch { return false; }
}
