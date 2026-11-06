import { MAX_POLYNOMIAL_DEGREE } from '../../config/limits.ts';
import type { Expression } from '../parser.ts';
import type { SequenceContext } from './context.ts';

/** p-recursiveの係数を有限次数の多項式として検証・抽出する。 */
export function readPolynomial<T>(context: SequenceContext<T>, node: Expression): T[] {
  const { field: f, evaluate, scalar, integer } = context;

  function trim(coefficients: T[]): T[] {
    while (coefficients.length > 1 && f.equal(coefficients.at(-1)!, f.zero)) coefficients.pop();
    if (coefficients.length > MAX_POLYNOMIAL_DEGREE + 1) throw new Error(`p-recursiveの係数多項式は${MAX_POLYNOMIAL_DEGREE}次までです。`);
    return coefficients;
  }
  function multiply(a: T[], b: T[]): T[] {
    if (a.length + b.length - 2 > MAX_POLYNOMIAL_DEGREE) throw new Error(`係数多項式は${MAX_POLYNOMIAL_DEGREE}次までです。`);
    const out = Array<T>(a.length + b.length - 1).fill(f.zero);
    a.forEach((value, i) => b.forEach((other, j) => {
      out[i + j] = f.add(out[i + j]!, f.mul(value, other));
    }));
    return trim(out);
  }
  function read(expression: Expression, seen = new Set<string>()): T[] {
    if (expression.kind === 'symbol' && (expression.name === 'x' || expression.name === 'X')) return [f.zero, f.one];
    if (expression.kind === 'integer') return [f.fromInteger(expression.value)];
    if (expression.kind === 'symbol') {
      if (seen.has(expression.name)) throw new Error('係数多項式の参照が循環しています。');
      return read(context.runtime.lookup(expression.name), new Set([...seen, expression.name]));
    }
    if (expression.kind === 'unary' && expression.operator === '-') return read(expression.operand, seen).map(value => f.sub(f.zero, value));
    if (expression.kind === 'call' && expression.callee.kind === 'symbol' && expression.callee.name === 'seq') {
      return trim(expression.args.map(arg => scalar(evaluate(arg, 1))));
    }
    if (expression.kind === 'binary' && expression.operator === '^') {
      const base = read(expression.left, seen);
      const exponent = integer(expression.right, 0, MAX_POLYNOMIAL_DEGREE);
      let out = [f.one];
      for (let k = 0; k < exponent; k++) out = multiply(out, base);
      return trim(out);
    }
    if (expression.kind === 'binary' && ['+', '-', '*', '/'].includes(expression.operator)) {
      const a = read(expression.left, seen), b = read(expression.right, seen);
      if (expression.operator === '*') return multiply(a, b);
      if (expression.operator === '/') {
        if (b.length !== 1) throw new Error('係数多項式はスカラーでのみ除算できます。');
        return trim(a.map(value => f.div(value, b[0]!)));
      }
      return trim(Array.from({ length: Math.max(a.length, b.length) }, (_, i) => expression.operator === '+'
        ? f.add(a[i] ?? f.zero, b[i] ?? f.zero)
        : f.sub(a[i] ?? f.zero, b[i] ?? f.zero)));
    }
    throw new Error('係数多項式はx、整数、四則演算、非負整数べき、seq(...)で指定してください。xを添字nと解釈します。');
  }
  return read(node);
}
