import type { Expression } from './parser.ts';
import type { SourceRange } from './source.ts';

/** ASTに保存された原文位置から、評価エラーを示す範囲を求める。 */
export function expressionRange(node: Expression): SourceRange | undefined {
  if ((node.kind === 'symbol' || node.kind === 'integer') && node.span) return node.span;
  let children: Expression[] = [];
  if (node.kind === 'unary' || node.kind === 'factorial') children = [node.operand];
  if (node.kind === 'binary') children = [node.left, node.right];
  if (node.kind === 'index') children = [node.target, node.index];
  if (node.kind === 'call') children = [node.callee, ...node.args];
  if (node.kind === 'lambda') children = [node.body];
  if (node.kind === 'conditional') children = [node.condition,node.yes,node.no];
  const ranges = children.flatMap((child) => { const range=expressionRange(child); return range ? [range] : []; });
  return ranges.length ? { start: Math.min(...ranges.map(r=>r.start)), end: Math.max(...ranges.map(r=>r.end)) } : undefined;
}
