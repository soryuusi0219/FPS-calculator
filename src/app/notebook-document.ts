import { MAX_EQUATION_GROUPS, MAX_EXPRESSION_LENGTH, MAX_NOTEBOOK_BYTES, MAX_NOTEBOOK_WIDTH, MAX_ROWS, MAX_SYSTEM_TEXT_LENGTH, MAX_TERMS, MIN_NOTEBOOK_WIDTH } from '../config/limits.ts';
import type { Session } from './session.ts';
import type { IdFactory } from './notebook-model.ts';
import { newRow } from './notebook-model.ts';

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function fail(message: string): never { throw new Error(`ノートを読み込めません: ${message}`); }

/** 保存・JSON・URLで共用する検証。データを全て確認してから新しいIDで復元する。 */
export function decodeNotebook(value: unknown, id?: IdFactory): Session {
  if (!record(value) || value.version !== 1 || value.format !== undefined && value.format !== 'fps-calculator' || !record(value.data)) fail('対応するversion:1のノート形式ではありません。');
  const data = value.data;
  if (!Array.isArray(data.rows) || data.rows.length < 1 || data.rows.length > MAX_ROWS) fail(`数式行は1〜${MAX_ROWS}行にしてください。`);
  if (!data.rows.every((row: unknown) => record(row) && typeof row.source === 'string' && row.source.length <= MAX_EXPRESSION_LENGTH && (row.initial === undefined || typeof row.initial === 'string' && row.initial.length <= MAX_EXPRESSION_LENGTH))) fail(`数式・初期値は文字列で${MAX_EXPRESSION_LENGTH}文字までです。`);
  if (typeof data.terms !== 'number' || !Number.isInteger(data.terms) || data.terms < 1 || data.terms > MAX_TERMS) fail(`打ち切り次数は1〜${MAX_TERMS}の整数にしてください。`);
  if (data.domain !== 'rational' && data.domain !== 'prime' || data.basis !== 'ogf' && data.basis !== 'egf' || typeof data.modulus !== 'string' || data.modulus.length > 10) fail('係数体・表示基底・modの形式が不正です。');
  if (data.systems !== undefined && (!Array.isArray(data.systems) || data.systems.length > MAX_EQUATION_GROUPS || !data.systems.every((system: unknown) => record(system) && typeof system.variables === 'string' && system.variables.length <= MAX_SYSTEM_TEXT_LENGTH && typeof system.equations === 'string' && system.equations.length <= MAX_SYSTEM_TEXT_LENGTH && typeof system.method === 'string' && ['auto', 'coefficient', 'newton'].includes(system.method)))) fail('連立グループの形式・文字数・個数が不正です。');
  const width = value.notebookWidth;
  return {
    input: {
      rows: data.rows.map((row: { source: string; initial?: string }) => ({ ...newRow(row.source, id), ...(row.initial !== undefined ? { initial: row.initial } : {}) })),
      terms: data.terms, domain: data.domain, basis: data.basis, modulus: data.modulus,
      ...(Array.isArray(data.systems) ? { systems: data.systems.map((system) => ({ id: newRow('', id).id, variables: system.variables as string, equations: system.equations as string, method: system.method as 'auto' | 'coefficient' | 'newton' })) } : {}),
    },
    presentation: value.view === 'series' ? 'series' : 'table',
    notebookWidth: typeof width === 'number' && Number.isFinite(width) && width >= MIN_NOTEBOOK_WIDTH && width <= MAX_NOTEBOOK_WIDTH ? width : null,
  };
}

export function notebookDocument(session: Session) {
  return {
    format: 'fps-calculator', version: 1,
    data: { ...session.input,
      rows: session.input.rows.map((row) => ({ source: row.source, ...(row.initial !== undefined ? { initial: row.initial } : {}) })),
      ...(session.input.systems ? { systems: session.input.systems.map(({ variables, equations, method }) => ({ variables, equations, method })) } : {}),
    }, view: session.presentation,
  };
}

export function exportNotebook(session: Session, pretty = true): string {
  const document = notebookDocument(session);
  let id = 0; decodeNotebook(document, () => `validate-${id++}`);
  const text = JSON.stringify(document, null, pretty ? 2 : undefined);
  if (new TextEncoder().encode(text).length > MAX_NOTEBOOK_BYTES) throw new Error('ノートが大きすぎます。内容を分けて保存してください。');
  return text;
}

export function importNotebook(text: string, id?: IdFactory): Session {
  if (new TextEncoder().encode(text).length > MAX_NOTEBOOK_BYTES) fail('JSONファイルは256 KiBまでです。');
  let value: unknown;
  try { value = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { return fail('JSONの構文が不正です。'); }
  return decodeNotebook(value, id);
}
