import type { Calculation } from '../model/calculation.ts';
import { parse, parseEquation, validDefinitionName } from '../language/parser.ts';
import type { Expression, Statement } from '../language/parser.ts';
import { freeSymbols } from '../language/dependencies.ts';
import { decodeNotebook } from './notebook-document.ts';

interface Field { source: string; kind: 'statement' | 'scalar' | 'variables' | 'equations'; label: string; set(value: string): void }
function fields(input: Calculation): Field[] {
  const out: Field[] = [];
  input.rows.forEach((row, i) => {
    out.push({ source: row.source, kind: 'statement', label: `式 ${i+1}`, set(value) { row.source=value; } });
    if (row.initial !== undefined) out.push({ source: row.initial, kind: 'scalar', label: `式 ${i+1} の定数項`, set(value) { row.initial=value; } });
  });
  input.systems?.forEach((system, i) => {
    for (const key of ['variables', 'equations'] as const) out.push({ source: system[key], kind: key, label: `連立 ${i+1} の${key === 'variables' ? '未知数' : '方程式'}`, set(value) { system[key]=value; } });
  });
  return out;
}
function statements(field: Field): { node: Expression; declaration?: { name: string; start: number; end: number } }[] {
  const parts = field.kind === 'variables' || field.kind === 'equations' ? [...field.source.matchAll(/[^\r\n]+/g)].map((match) => ({ source: match[0], offset: match.index })) : [{ source: field.source, offset: 0 }];
  return parts.filter((part) => part.source.trim()).map(({ source, offset }) => {
    if (field.kind === 'equations') return { node: parseEquation(source, offset) };
    const statement: Statement = parse(source, offset);
    if (field.kind === 'scalar' && statement.name) throw new Error('初期値に定義文を含められません。');
    const declaration = statement.name && statement.nameSpan ? { name: statement.name, ...statement.nameSpan } : field.kind === 'variables' && statement.expression.kind === 'symbol' && statement.expression.span ? { name: statement.expression.name, ...statement.expression.span } : undefined;
    if (field.kind === 'variables' && (!declaration || !validDefinitionName(declaration.name))) throw new Error('未知数の宣言が不正です。');
    return { node: statement.expression, ...(declaration ? { declaration } : {}) };
  });
}
export function declaredNames(input: Calculation): string[] {
  const names = new Set<string>();
  for (const field of fields(input)) {
    if (field.kind === 'scalar' || field.kind === 'equations') continue;
    // 編集途中の別の行があっても、解析できる宣言は補完候補に使う。
    for (const line of field.source.split(/\r?\n/)) {
      try { for (const entry of statements({ ...field, source: line })) if (entry.declaration) names.add(entry.declaration.name); } catch { /* incomplete */ }
    }
  }
  return [...names].sort();
}

/** 書式とIDを保ち、グローバルな定義/自由参照だけを原文の範囲で置換する。 */
export function renameVariable(input: Calculation, from: string, to: string): { input: Calculation; count: number } {
  if (!validDefinitionName(from) || !validDefinitionName(to)) throw new Error('名前は予約語以外の識別子にしてください。');
  if (from === to) return { input, count: 0 };
  const copy: Calculation = { ...input, rows: input.rows.map((row) => ({ ...row })), ...(input.systems ? { systems: input.systems.map((system) => ({ ...system })) } : {}) };
  const parsed = fields(copy).map((field) => {
    try { return { field, entries: statements(field) }; }
    catch (error) { throw new Error(`${field.label}を修正してから名前を変更してください: ${error instanceof Error ? error.message : String(error)}`); }
  });
  const declarations = parsed.flatMap(({ entries }) => entries.flatMap((entry) => entry.declaration ? [entry.declaration.name] : []));
  if (declarations.filter((name) => name === from).length !== 1) throw new Error('変更元の名前はノート内で1回だけ定義されている必要があります。');
  if (declarations.includes(to)) throw new Error(`${to} は既に定義されています。`);
  const definitions = new Map(parsed.flatMap(({ entries }) => entries.flatMap(entry => entry.declaration ? [[entry.declaration.name, entry.node] as const] : [])));
  const resolve = (node: Expression): Expression => {
    const seen = new Set<string>();
    while (node.kind === 'symbol' && definitions.has(node.name) && !seen.has(node.name)) {
      seen.add(node.name); node = definitions.get(node.name)!;
    }
    return node;
  };
  // 名前付きmapラムダには呼出し時にiが注入される。同じ原文が通常呼出しにも
  // 使われる場合は一意な束縛として書き換えられないため、曖昧な変更を拒否する。
  const lambdaUsesFrom = (node: Expression): boolean => {
    if (node.kind === 'lambda') return freeSymbols(node).has(from);
    if (node.kind === 'call') return lambdaUsesFrom(node.callee) || node.args.some(lambdaUsesFrom);
    if (node.kind === 'binary') return lambdaUsesFrom(node.left) || lambdaUsesFrom(node.right);
    if (node.kind === 'unary' || node.kind === 'factorial') return lambdaUsesFrom(node.operand);
    if (node.kind === 'index') return lambdaUsesFrom(node.target) || lambdaUsesFrom(node.index);
    if (node.kind === 'conditional') return [node.condition,node.yes,node.no].some(lambdaUsesFrom);
    return false;
  };
  const hasRelevantLambda = parsed.some(({entries}) => entries.some(entry => lambdaUsesFrom(entry.node)));
  let count = 0;
  for (const { field, entries } of parsed) {
    const replacements = new Map<number, number>();
    const visit = (node: Expression, bound: ReadonlySet<string> = new Set()) => {
      if (node.kind === 'symbol') {
        if (node.name === from && !bound.has(from)) {
          if (bound.has(to)) throw new Error(`${field.label}: 変更先 ${to} がラムダ引数・mapの補助名に捕獲されます。別の名前を指定してください。`);
          if (node.span) replacements.set(node.span.start, node.span.end);
        }
      } else if (node.kind === 'lambda') visit(node.body, new Set([...bound, ...node.parameters]));
      else if (node.kind === 'binary') { visit(node.left, bound); visit(node.right, bound); }
      else if (node.kind === 'unary' || node.kind === 'factorial') visit(node.operand, bound);
      else if (node.kind === 'index') { visit(node.target, bound); visit(node.index, bound); }
      else if (node.kind === 'conditional') { visit(node.condition, bound); visit(node.yes, bound); visit(node.no, bound); }
      else if (node.kind === 'call') {
        const transform = node.callee.kind === 'symbol' && node.callee.name === 'map' ? node.args[1] : undefined;
        if ((from === 'i' || to === 'i') && transform?.kind === 'symbol' && !['a','n','i'].includes(transform.name)) {
          const target = resolve(transform);
          if (target.kind === 'lambda' ? freeSymbols(target).has(from) : hasRelevantLambda) {
            throw new Error(`${field.label}: 名前付きmap変換の補助名 i の束縛が変わります。ラムダの添字引数を明示してから変更してください。`);
          }
        }
        visit(node.callee, bound);
        node.args.forEach((arg, i) => visit(arg, node.callee.kind === 'symbol' && node.callee.name === 'map' && i === 1 ? new Set([...bound, 'a', 'n', 'i']) : bound));
      }
    };
    for (const entry of entries) {
      if (entry.declaration?.name === from) replacements.set(entry.declaration.start, entry.declaration.end);
      visit(entry.node);
    }
    let source = field.source;
    for (const [start, end] of [...replacements].sort((a,b) => b[0]-a[0])) source = source.slice(0,start)+to+source.slice(end);
    count += replacements.size; field.set(source);
  }
  let id = 0; decodeNotebook({ version: 1, data: copy }, () => `validate-${id++}`);
  return { input: copy, count };
}
