import type { Expression } from './parser.ts';
import { freeSymbols } from './dependencies.ts';
import { builtinDefinition } from './builtins.ts';
import { MAX_AGGREGATE_TERMS } from '../config/limits.ts';

/** k>=startで常に ord(term)>=slope*k+offset となる証明済み下界。 */
export interface OrderBound { slope: number; offset: number }
interface ExponentBound extends OrderBound { exact: boolean }
interface BoundRuntime {
  integer(node: Expression): number;
  order(node: Expression): number;
}
const safe = (value: number): number => {
  if (value !== Infinity && !Number.isSafeInteger(value)) throw new Error('無限演算の次数の下界が安全な整数の範囲を超えました。有限範囲を指定してください。');
  return value;
};
const fixed = (offset: number): OrderBound => ({ slope: 0, offset: safe(offset) });
const add = (a: OrderBound, b: OrderBound): OrderBound => ({ slope: safe(a.slope + b.slope), offset: safe(a.offset + b.offset) });

/** s*k+b<Nとなる最後の添字。境界の丸めで寄与する項を落とさない。 */
export function infiniteLast(start: number, precision: number, bound: OrderBound): number {
  if (bound.offset === Infinity) return start - 1;
  const slope=BigInt(bound.slope), numerator=BigInt(precision)-1n-BigInt(bound.offset);
  const last=numerator>=0n?numerator/slope:(numerator-slope+1n)/slope;
  if (last < BigInt(start)) return start-1;
  if (last-BigInt(start)+1n > BigInt(MAX_AGGREGATE_TERMS)) throw new Error(`総和・総積は1回あたり${MAX_AGGREGATE_TERMS}項までです。`);
  return Number(last);
}

/** 有限個の0を観測して無限の尾を捨てない。構文と既知係数から下界を導出する。 */
export function infiniteBound(body: Expression, parameter: string, start: number, product: boolean, runtime: BoundRuntime): OrderBound {
  const depends = (node: Expression): boolean => {
    if (parameter !== 'x' && parameter !== 'X') return freeSymbols(node).has(parameter);
    // freeSymbolsは級数の変数x/Xを除くが、ここではラムダの添字として束縛できる。
    if (node.kind === 'symbol') return node.name === parameter;
    if (node.kind === 'lambda') return !node.parameters.includes(parameter) && depends(node.body);
    if (node.kind === 'binary') return depends(node.left) || depends(node.right);
    if (node.kind === 'unary' || node.kind === 'factorial') return depends(node.operand);
    if (node.kind === 'index') return depends(node.target) || depends(node.index);
    if (node.kind === 'conditional') return depends(node.condition) || depends(node.yes) || depends(node.no);
    return node.kind === 'call' && (depends(node.callee) || node.args.some(depends));
  };
  const is = (node: Expression, n: bigint) => node.kind === 'integer' && node.value === n;
  const scalarSyntax = (node: Expression): boolean => {
    if (node.kind === 'integer' || node.kind === 'index' || node.kind === 'symbol' && node.name === parameter) return true;
    if (node.kind === 'factorial' || node.kind === 'unary') return scalarSyntax(node.operand);
    if (node.kind === 'binary') return scalarSyntax(node.left) && scalarSyntax(node.right);
    if (node.kind === 'call' && node.callee.kind === 'symbol') return !!builtinDefinition(node.callee.name)?.combinatorial || ['factorial','coeff'].includes(node.callee.name);
    return false;
  };
  // min(s1*k+b1,s2*k+b2)の安全なアフィン下界（k>=start）。
  const minimum = (a: OrderBound, b: OrderBound): OrderBound => {
    if (a.offset === Infinity) return b;
    if (b.offset === Infinity) return a;
    const slope = Math.min(a.slope, b.slope);
    return { slope, offset: Math.min(safe(a.offset + safe(safe(a.slope - slope) * start)), safe(b.offset + safe(safe(b.slope - slope) * start))) };
  };
  function exponent(node: Expression): ExponentBound {
    if (!depends(node)) return { ...fixed(runtime.integer(node)), exact: true };
    if (node.kind === 'symbol' && node.name === parameter) return { slope: 1, offset: 0, exact: true };
    if (node.kind === 'binary') {
      const a = exponent(node.left), b = exponent(node.right);
      if (node.operator === '+') return { ...add(a, b), exact: a.exact && b.exact };
      // 下界の引き算・負数倍は上界になってしまうため、完全なアフィン式だけを許す。
      if (node.operator === '-' && b.exact) return { slope: safe(a.slope - b.slope), offset: safe(a.offset - b.offset), exact: a.exact };
      if (node.operator === '*' && (a.slope === 0 || b.slope === 0)) {
        const constant = a.slope === 0 ? a : b, other = a.slope === 0 ? b : a;
        if (constant.exact && (constant.offset >= 0 || other.exact)) return { slope: safe(constant.offset * other.slope), offset: safe(constant.offset * other.offset), exact: other.exact };
      }
      // k^m >= k (k>=1, m>=1)。等式ではなく下界としてのみ使う。
      if (node.operator === '^' && node.left.kind === 'symbol' && node.left.name === parameter && b.exact && b.slope === 0 && b.offset >= 1 && Number.isInteger(b.offset) && start >= 1) return { slope: 1, offset: 0, exact: b.offset === 1 };
    }
    throw new Error('無限演算の指数から増大する次数の下界を証明できません。有限範囲を指定してください。');
  }
  function order(node: Expression): OrderBound {
    if (!depends(node)) return fixed(runtime.order(node));
    if (scalarSyntax(node)) return fixed(0);
    if (node.kind === 'symbol' || node.kind === 'integer' || node.kind === 'index' || node.kind === 'factorial') return fixed(0);
    if (node.kind === 'unary' && node.operator === '-') return order(node.operand);
    if (node.kind === 'binary') {
      if (node.operator === '-' && is(node.right, 1n)) { const bound = unit(node.left); if (bound) return bound; }
      // h(g_k)-c = (h-c)(g_k)。既知の定数項が相殺されれば位数の増大を証明できる。
      if (node.operator === '-' && node.left.kind === 'call' && !depends(node.right)) {
        const call = node.left, name = call.callee.kind === 'symbol' ? call.callee.name : '';
        const outer = name === 'compose' ? call.args[0] : !builtinDefinition(name) || name === 'Catalan' ? call.callee : undefined;
        const inner = name === 'compose' ? call.args[1] : call.args[0];
        if (outer && inner && !depends(outer)) {
          const v = runtime.order({ kind: 'binary', operator: '-', left: outer, right: node.right }), b = order(inner);
          if (v >= 1 && Number.isFinite(v) && safe(safe(b.slope * start) + b.offset) >= 1) return { slope: safe(v * b.slope), offset: safe(v * b.offset) };
        }
      }
      if (node.operator === '+' || node.operator === '-') return minimum(order(node.left), order(node.right));
      if (node.operator === '*') return add(order(node.left), order(node.right));
      if (node.operator === '/') {
        // 一般の分母の位数の下界から逆元の下界は求められない。
        if (is(node.right, 1n) || scalarSyntax(node.right) || unit(node.right)) return order(node.left);
        if (!depends(node.right) && runtime.order(node.right) === 0) return order(node.left);
      }
      if (node.operator === '^') {
        const a = order(node.left), b = exponent(node.right);
        if (safe(safe(b.slope * start) + b.offset) < 0 || b.slope < 0) throw new Error('無限演算の指数は指定範囲で非負になる必要があります。');
        if (a.slope === 0 && a.offset >= 0 && Number.isFinite(a.offset)) return { slope: safe(a.offset * b.slope), offset: safe(a.offset * b.offset) };
        if (b.slope === 0 && b.offset >= 0) return { slope: safe(a.slope * b.offset), offset: safe(a.offset * b.offset) };
      }
    }
    if (node.kind === 'call') {
      const name = node.callee.kind === 'symbol' ? node.callee.name : '';
      const a = node.args[0];
      if (a && (name === 'diff' || name === 'integral')) {
        const bound = order(a);
        return { ...bound, offset: safe(bound.offset + (name === 'diff' ? -1 : 1)) };
      }
      if (a && (name === 'compose' || !['exp','log','inv','sqrt','fps'].includes(name) && !depends(node.callee))) {
        const outer = name === 'compose' ? a : node.callee;
        const inner = name === 'compose' ? node.args[1]! : a;
        if (!depends(outer)) {
          const v = runtime.order(outer), b = order(inner);
          if (v >= 0 && Number.isFinite(v) && safe(safe(b.slope * start) + b.offset) >= 1) return { slope: safe(v * b.slope), offset: safe(v * b.offset) };
        }
      }
      if (name === 'log' && a) { const bound = unit(a); if (bound) return bound; }
    }
    throw new Error('無限和の各項の次数が増大することを証明できません。有限範囲を指定してください。');
  }
  /** 1+O(x^(s*k+b)) の下界。 */
  function unit(node: Expression): OrderBound | undefined {
    if (is(node, 1n)) return fixed(Infinity);
    if (node.kind === 'binary') {
      if (node.operator === '+' && is(node.right, 1n)) return order(node.left);
      if ((node.operator === '+' || node.operator === '-') && is(node.left, 1n)) return order(node.right);
      if (node.operator === '/' && is(node.left, 1n)) return unit(node.right);
      if (node.operator === '*' || node.operator === '/') {
        const a = unit(node.left), b = unit(node.right);
        if (a && b) return minimum(a, b);
      }
      if (node.operator === '^' && (!depends(node.right) || scalarSyntax(node.right))) return unit(node.left);
    }
    if (node.kind === 'call' && node.callee.kind === 'symbol') {
      if (node.callee.name === 'inv') return unit(node.args[0]!);
      if (node.callee.name === 'exp') return order(node.args[0]!);
    }
    return;
  }
  const bound = product ? unit(body) : order(body);
  if (is(body, product ? 1n : 0n)) return { slope: 1, offset: Infinity };
  if (!bound || !Number.isFinite(bound.slope) || bound.slope <= 0 || !Number.isFinite(bound.offset)) throw new Error(`無限${product ? '積' : '和'}の形式的収束を証明できません。${product ? '各因子と1の差' : '各項'}の次数が無限大へ増大する形、または有限範囲を指定してください。`);
  return bound;
}
