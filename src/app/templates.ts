import type { NotebookTemplate } from './sample-catalog.ts';
import { decodeNotebook } from './notebook-document.ts';
export type { NotebookTemplate } from './sample-catalog.ts';

const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase();
function searchText(entry: NotebookTemplate): string {
  const document=entry.document as {data?:{rows?:{source?:unknown;comment?:unknown}[]}}|null;
  const rows=Array.isArray(document?.data?.rows)?document.data.rows:[];
  return normalize([entry.title,entry.description,...rows.flatMap(row=>[row.source,row.comment].filter((value):value is string=>typeof value==='string'))].join('\n'));
}
export function filterTemplates(entries: readonly NotebookTemplate[], category: string, query: string): NotebookTemplate[] {
  const words=normalize(query).trim().split(/\s+/).filter(Boolean);
  return entries.filter(entry=>{
    if(category!=='all'&&entry.category!==category)return false;
    const text=searchText(entry);
    return words.every(word=>text.includes(word));
  });
}

/** 選択したノートを計算せず、コメントと設定を読みやすいplain textへ整形する。 */
export function previewTemplate(entry:NotebookTemplate):string {
  let id=0;
  const {input}=decodeNotebook(entry.document,()=>`preview-${id++}`);
  const lines=[entry.description,'',`係数体: ${input.domain==='rational'?'有理数':`mod ${input.modulus}`} / N=${input.terms} / ${input.basis.toUpperCase()}表示`];
  for(const [i,row] of input.rows.entries()) {
    lines.push('',`式 ${i+1}: ${row.source}`);
    if(row.initial)lines.push(`再帰の初期値: ${row.initial}`);
    if(row.comment)lines.push(row.comment);
  }
  for(const [i,system] of (input.systems??[]).entries())lines.push('',`連立 ${i+1}: ${system.method}`,'未知数・初期係数:',system.variables,'方程式:',system.equations);
  return lines.join('\n');
}
