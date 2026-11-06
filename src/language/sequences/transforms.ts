import { binomialTransform } from '../../core/sequences.ts';
import { MAX_INTERNAL_PRECISION } from '../../config/limits.ts';
import type { Expression } from '../parser.ts';
import type { Value } from '../values.ts';
import type { SequenceContext } from './context.ts';

/** 通常係数への変換。抽出が必要とする入力精度もここで決める。 */
export function transformBuiltin<T>(context: SequenceContext<T>, name: string, args: Expression[]): Value<T> {
  const { field: f, integer, fps, series, precision } = context;
  if (name === 'even' || name === 'odd' || name === 'extract') {
    const step = name === 'extract' ? integer(args[1]!, 1, 16) : 2;
    const residue = name === 'extract' ? integer(args[2]!, 0, step - 1) : name === 'odd' ? 1 : 0;
    const required = step * (precision - 1) + residue + 1;
    if (required > MAX_INTERNAL_PRECISION) throw new Error(`項抽出に必要な内部精度が${MAX_INTERNAL_PRECISION}を超えます。`);
    const input = series(args[0]!, required);
    return fps(Array.from({ length: precision }, (_, n) => input.at(step * n + residue)));
  }
  const input = series(args[0]!);
  if (name === 'hadamard') {
    const other = series(args[1]!);
    return fps(input.coefficients.map((coefficient, n) => f.mul(coefficient, other.at(n))));
  }
  if (name === 'partialSums') {
    let sum = f.zero;
    return fps(input.coefficients.map(coefficient => { sum = f.add(sum, coefficient); return sum; }));
  }
  return fps(binomialTransform(f, input.coefficients, name === 'inverseBinomialTransform'));
}
