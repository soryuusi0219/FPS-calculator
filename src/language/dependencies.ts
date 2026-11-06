import type { Expression } from './parser.ts';
import { builtinDefinition } from './builtins.ts';

/** 自由変数のみを収集する。mapの補助名とラムダ引数を外部参照と混同しない。 */
export function freeSymbols(node: Expression, bound = new Set<string>()): Set<string> {
  const out = new Set<string>();
  const visit = (child: Expression, locals = bound) => { for (const name of freeSymbols(child, locals)) out.add(name); };
  switch (node.kind) {
    case 'symbol': if (!bound.has(node.name) && !['x', 'X', 'true', 'false'].includes(node.name) && !builtinDefinition(node.name)) out.add(node.name); break;
    case 'integer': break;
    case 'unary': case 'factorial': visit(node.operand); break;
    case 'binary': visit(node.left); visit(node.right); break;
    case 'index': visit(node.target); visit(node.index); break;
    case 'conditional': visit(node.condition); visit(node.yes); visit(node.no); break;
    case 'lambda': visit(node.body, new Set([...bound, ...node.parameters])); break;
    case 'call':
      visit(node.callee);
      node.args.forEach((arg, i) => visit(arg, node.callee.kind === 'symbol' && node.callee.name === 'map' && i === 1 ? new Set([...bound, 'a', 'n', 'i']) : bound));
  }
  return out;
}

/** 捕獲を避けてラムダ引数を置換する。内部名はユーザーの識別子にない文字を含む。 */
function substitute(node: Expression, replacements: ReadonlyMap<string, Expression>, fresh: () => string): Expression {
  const sub = (child: Expression) => substitute(child, replacements, fresh);
  switch (node.kind) {
    case 'symbol': return replacements.get(node.name) ?? node;
    case 'integer': return node;
    case 'unary': case 'factorial': return { ...node, operand: sub(node.operand) };
    case 'binary': return { ...node, left: sub(node.left), right: sub(node.right) };
    case 'index': return { ...node, target: sub(node.target), index: sub(node.index) };
    case 'conditional': return { ...node, condition: sub(node.condition), yes: sub(node.yes), no: sub(node.no) };
    case 'call': return { ...node, callee: sub(node.callee), args: node.args.map(sub) };
    case 'lambda': {
      const locals = new Map(replacements);
      const parameters = node.parameters.map((name) => { const renamed = fresh(); locals.set(name, { kind: 'symbol', name: renamed }); return renamed; });
      return { ...node, parameters, body: substitute(node.body, locals, fresh) };
    }
  }
}

/** 循環解析用に名前付き/直接ラムダ呼出しを展開する。評価器の局所束縛は変更しない。 */
export function expandCalls(expression: Expression, definitions: ReadonlyMap<string, Expression>): Expression {
  let steps = 0; let serial = 0;
  const fresh = () => `$local${serial++}`;
  const resolve = (node: Expression, seen = new Set<string>()): Expression => {
    if (node.kind !== 'symbol' || !definitions.has(node.name) || seen.has(node.name)) return node;
    seen.add(node.name);
    return resolve(definitions.get(node.name)!, seen);
  };
  function expand(node: Expression, depth = 0): Expression {
    if (++steps > 20000 || depth > 128) throw new Error('循環定義内のラムダ展開の入れ子・サイズが上限を超えました。');
    const ex = (child: Expression) => expand(child, depth + 1);
    switch (node.kind) {
      case 'integer': case 'symbol': case 'lambda': return node;
      case 'unary': case 'factorial': return { ...node, operand: ex(node.operand) };
      case 'binary': return { ...node, left: ex(node.left), right: ex(node.right) };
      case 'index': return { ...node, target: ex(node.target), index: ex(node.index) };
      case 'conditional': {
        const condition = ex(node.condition);
        if (condition.kind === 'symbol' && ['true', 'false'].includes(condition.name)) return ex(condition.name === 'true' ? node.yes : node.no);
        return { ...node, condition, yes: ex(node.yes), no: ex(node.no) };
      }
      case 'call': {
        if (node.callee.kind === 'symbol' && node.callee.name === 'if' && node.args.length === 3 && node.args[0]!.kind === 'symbol' && ['true', 'false'].includes(node.args[0]!.name)) return ex(node.args[node.args[0]!.name === 'true' ? 1 : 2]!);
        const callee = resolve(ex(node.callee));
        const args = node.args.map(ex);
        if (callee.kind !== 'lambda') return { ...node, args };
        if (callee.parameters.length !== args.length) throw new Error(`ラムダには ${callee.parameters.length} 個の引数が必要です。`);
        return ex(substitute(callee.body, new Map(callee.parameters.map((name, i) => [name, args[i]!])), fresh));
      }
    }
  }
  return expand(expression);
}

export function stronglyConnected(graph: ReadonlyMap<string, ReadonlySet<string>>): string[][] {
  let serial = 0;
  const indices = new Map<string, number>(); const low = new Map<string, number>();
  const stack: string[] = []; const active = new Set<string>(); const groups: string[][] = [];
  function visit(name: string): void {
    indices.set(name, serial); low.set(name, serial++); stack.push(name); active.add(name);
    for (const next of graph.get(name) ?? []) {
      if (!graph.has(next)) continue;
      if (!indices.has(next)) { visit(next); low.set(name, Math.min(low.get(name)!, low.get(next)!)); }
      else if (active.has(next)) low.set(name, Math.min(low.get(name)!, indices.get(next)!));
    }
    if (low.get(name) !== indices.get(name)) return;
    const group: string[] = [];
    let next: string;
    do { next = stack.pop()!; active.delete(next); group.push(next); } while (next !== name);
    groups.push(group.sort());
  }
  for (const name of graph.keys()) if (!indices.has(name)) visit(name);
  return groups;
}
