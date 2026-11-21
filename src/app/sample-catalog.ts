import { importNotebook, notebookDocument } from './notebook-document.ts';

export interface TemplateCategory { id: string; label: string }
export interface NotebookTemplate {
  id: string;
  title: string;
  description: string;
  category: string;
  document: unknown;
}
export interface TemplateCatalog {
  categories: readonly TemplateCategory[];
  templates: readonly NotebookTemplate[];
}
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function fail(message: string): never { throw new Error(`サンプル集が不正です: ${message}`); }
function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(`${label}には空でない文字列が必要です。`);
  return value;
}

/** メタデータと保存用JSONを接続する。ファイルの取得方法やVite/Nodeには依存しない。 */
export function createTemplateCatalog(metadata: unknown, documents: Readonly<Record<string, unknown>>): TemplateCatalog {
  if (!record(metadata) || metadata.version !== 1 || !Array.isArray(metadata.categories) || !Array.isArray(metadata.samples)) fail('version:1のcategoriesとsamplesが必要です。');
  const categoryIds = new Set<string>();
  const categories = metadata.categories.map(value => {
    if (!record(value)) fail('分類の形式を確認してください。');
    const id = text(value.id, '分類ID');
    if (id === 'all' || categoryIds.has(id)) fail(`分類IDが予約済みまたは重複しています: ${id}`);
    categoryIds.add(id);
    return { id, label: text(value.label, '分類名') };
  });
  const ids = new Set<string>(), files = new Set<string>();
  const templates = metadata.samples.map(value => {
    if (!record(value)) fail('サンプルのメタデータを確認してください。');
    const id = text(value.id, 'サンプルID'), category = text(value.category, '分類ID');
    const file = text(value.file, 'ファイル名');
    if (ids.has(id)) fail(`サンプルIDが重複しています: ${id}`);
    if (!categoryIds.has(category)) fail(`未定義の分類です: ${category}`);
    if (!file.endsWith('.json') || /[\\:]/.test(file) || file.split('/').some(part => !part || part === '.' || part === '..')) fail(`ファイル名はsamples内の相対JSONパスにしてください: ${file}`);
    if (files.has(file)) fail(`ファイルが重複登録されています: ${file}`);
    if (!Object.hasOwn(documents, file)) fail(`ファイルが見つかりません: ${file}`);
    ids.add(id); files.add(file);
    const source = documents[file];
    if (!record(source) || source.format !== 'fps-calculator' || source.version !== 1 || source.view !== 'table' && source.view !== 'series') fail(`保存用ノートJSONではありません: ${file}`);
    let serial = 0;
    let document: unknown;
    try { document = notebookDocument(importNotebook(JSON.stringify(source), () => `sample-${serial++}`)); }
    catch (error) { fail(`${file}: ${error instanceof Error ? error.message : String(error)}`); }
    return { id, title: text(value.title, 'タイトル'), description: text(value.description, '説明'), category, document };
  });
  for (const file of Object.keys(documents)) if (!files.has(file)) fail(`メタデータに登録されていません: ${file}`);
  return { categories, templates };
}
