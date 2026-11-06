export const templateCategories = [
  { id: 'combinatorics', label: '組合せ論' }, { id: 'recurrences', label: '漸化式' },
  { id: 'trees', label: '木' }, { id: 'systems', label: '連立系' },
] as const;
export interface NotebookTemplate {
  id: string; title: string; description: string;
  category: typeof templateCategories[number]['id'];
  document: unknown;
}
/** 一覧・検索・プレビュー・読み込みの枠のみ。サンプルの内容は別途追加する。 */
export const notebookTemplates: readonly NotebookTemplate[] = [];
export function filterTemplates(entries: readonly NotebookTemplate[], category: string, query: string): NotebookTemplate[] {
  const needle = query.trim().toLocaleLowerCase();
  return entries.filter((entry) => (category === 'all' || entry.category === category) && `${entry.title}\n${entry.description}`.toLocaleLowerCase().includes(needle));
}
