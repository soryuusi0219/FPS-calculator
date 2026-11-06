import { builtinDefinition, functionNames } from './builtins.ts';
import { parse, parseEquation, validDefinitionName } from './parser.ts';
import { diagnosticOf, SourceError } from './source.ts';
import type { Diagnostic } from './source.ts';
import { tokenize } from './tokens.ts';

export type EditorMode = 'statement' | 'scalar' | 'variables' | 'equations';
export function syntaxDiagnostic(source: string, mode: EditorMode): Diagnostic | undefined {
  try {
    const parts = mode === 'variables' || mode === 'equations' ? [...source.matchAll(/[^\r\n]+/g)].map(m=>({source:m[0],offset:m.index})) : [{source,offset:0}];
    for (const part of parts) {
      if (!part.source.trim()) continue;
      if (mode === 'equations') { parseEquation(part.source,part.offset); continue; }
      const statement=parse(part.source,part.offset);
      if (mode === 'scalar' && statement.name) throw new SourceError('初期値にはスカラー式を入力してください。',statement.nameSpan!.start,statement.nameSpan!.end);
      if (mode === 'variables') {
        const name=statement.name ?? (statement.expression.kind === 'symbol' ? statement.expression.name : '');
        if (!validDefinitionName(name)) throw new SourceError('未知数の名前が不正です。',part.offset,part.offset+part.source.length);
      }
    }
  } catch(error) { return diagnosticOf(error) ?? {start:0,end:Math.max(1,source.length),message:error instanceof Error?error.message:String(error)}; }
  return;
}
export function bracketMatches(source: string, caret: number): { matching: number[]; invalid: number[] } {
  const stack: {char:string;position:number}[]=[]; const pairs=new Map<number,number>(); const invalid:number[]=[];
  for(const token of tokenize(source,true)) {
    if(token.text==='('||token.text==='[')stack.push({char:token.text,position:token.position});
    else if(token.text===')'||token.text===']') {
      const open=stack.pop();
      if(!open||open.char!==(token.text===')'?'(':'[')){invalid.push(token.position);if(open)invalid.push(open.position);}
      else {pairs.set(open.position,token.position);pairs.set(token.position,open.position);}
    }
  }
  invalid.push(...stack.map(item=>item.position));
  const at=[caret,caret-1].find(position=>pairs.has(position));
  return {matching:at===undefined?[]:[at,pairs.get(at)!],invalid};
}
export interface Completion { name: string; kind: 'function' | 'variable'; arity?: number }
export function completions(source: string, caret: number, names: readonly string[], force = false): {start:number;end:number;items:Completion[]} {
  const token=tokenize(source,true).find(token=>token.kind==='identifier'&&token.position<caret&&token.end>=caret);
  const start=token?.position ?? caret;const end=token?.end ?? caret;
  const prefix=source.slice(start,caret);
  if(!force&&!prefix)return {start,end,items:[]};
  const locals=[...source.slice(0,caret).matchAll(/(?:\b([A-Za-z_][A-Za-z_0-9]*)|\(([A-Za-z_0-9,\s]+)\))\s*=>/g)].flatMap(match=>(match[1]??match[2]??'').split(',').map(s=>s.trim()));
  if(/\bmap\s*\(/.test(source.slice(0,caret)))locals.push('a','n','i');
  const map=new Map<string,Completion>();
  for(const name of ['x','X','true','false',...names,...locals])if(name)map.set(name,{name,kind:'variable'});
  for(const name of functionNames)map.set(name,name === 'Catalan' ? {name,kind:'variable'} : {name,kind:'function',arity:builtinDefinition(name)!.arity});
  if (!force && map.get(prefix)?.kind === 'variable') return {start,end,items:[]};
  const items=[...map.values()].filter(item=>item.name.toLowerCase().startsWith(prefix.toLowerCase())&&(force||item.name.toLowerCase()!==prefix.toLowerCase()||item.kind==='function'&&source[end]!=='(')).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,10);
  return {start,end,items};
}
