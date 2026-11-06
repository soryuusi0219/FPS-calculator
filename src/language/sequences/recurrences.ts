import { linearRecurrence, pRecursive, recurrenceToDifferential } from '../../core/sequences.ts';
import { MAX_P_RECURSIVE_ORDER, MAX_RECURRENCE_ORDER } from '../../config/limits.ts';
import type { Expression } from '../parser.ts';
import type { Value } from '../values.ts';
import type { SequenceContext } from './context.ts';
import { readPolynomial } from './polynomial.ts';
import { polynomialText, rationalLines, report } from './analysis.ts';

export function sequenceLiteral<T>(context: SequenceContext<T>, args: Expression[]): Value<T> {
  const { field: f, evaluate, scalar, fps, precision } = context;
  return fps(Array.from({ length: precision }, (_, i) => i < args.length ? scalar(evaluate(args[i]!, 1)) : f.zero), args.length);
}

export function linearBuiltin<T>(context: SequenceContext<T>, args: Expression[], analysis = false): Value<T> {
  const { field: f, integer, vector, fps, precision } = context;
  const order = integer(args[0]!, 1, MAX_RECURRENCE_ORDER);
  const coefficients = vector(args[1]!, order), initial = vector(args[2]!, order);
  if (!analysis) return fps(linearRecurrence(f, coefficients, initial, precision));
  const result = rationalLines(f, coefficients, initial);
  return report('線形漸化式からの有理母関数', result.lines, result.expression);
}

export function recurrenceBuiltin<T>(context: SequenceContext<T>, args: Expression[]): Value<T> {
  const { integer, vector, evaluate, scalar, fps, precision, runtime } = context;
  const count = integer(args[0]!, 1, MAX_RECURRENCE_ORDER);
  const initial = vector(args[1]!, count), lambda = evaluate(args[2]!);
  if (lambda.kind !== 'lambda' || lambda.parameters.length !== 2) throw new Error('recurrence の第3引数は (a,n)=>... のラムダにしてください。');
  const values = [...initial];
  for (let n = count; n < precision; n++) {
    const accessor: Extract<Value<T>, { kind: 'history' }> = {
      kind: 'history',
      coefficient(j) {
        if (j < 0 || j >= n) throw new Error(`漸化式のa[${j}]は未確定です。0 ≤ 添字 < ${n} の過去の項だけ参照できます。`);
        const value = runtime.scalar(values[j]!);
        if (value.kind !== 'scalar') throw new Error('スカラーが必要です。');
        return value;
      },
    };
    values.push(scalar(runtime.invoke(lambda, [accessor, runtime.index(n)], precision)));
  }
  return fps(values.slice(0, precision));
}

export function pRecursiveBuiltin<T>(context: SequenceContext<T>, args: Expression[], analysis = false): Value<T> {
  const { field: f, vector, fps, precision } = context;
  const order = args.length - 2;
  if (order > MAX_P_RECURSIVE_ORDER) throw new Error('p-recursiveは8階までです。');
  const initial = vector(args[0]!, order), polynomials = args.slice(1).map(arg => readPolynomial(context, arg));
  if (polynomials.at(-1)!.every(coefficient => f.equal(coefficient, f.zero))) throw new Error('最高シフトの係数多項式が0です。');
  if (!analysis) return fps(pRecursive(f, polynomials, initial, precision));
  const { operators, boundary } = recurrenceToDifferential(f, polynomials, initial);
  const derivative = (order: number) => {
    let result = 'F';
    for (let j = 0; j < order; j++) result = `diff(${result})`;
    return result;
  };
  const left = operators.flatMap((polynomial, k) => polynomial.every(coefficient => f.equal(coefficient, f.zero))
    ? [] : [`(${polynomialText(f, polynomial)})*${derivative(k)}`]).join('+') || '0';
  const equation = left + ` = ${polynomialText(f, boundary)}`;
  return report('p-recursiveからの微分方程式（通常母関数）', [
    `Σ p_j(n) a_(n+j) = 0 (n ≥ 0), 次数 ${order}`,
    `初期係数 a_0…a_${order - 1}: ${initial.map(coefficient => f.format(coefficient)).join(', ')}`,
    equation, '入力のxは係数多項式の添字nを表します。初期値の境界項を右辺に含めています。',
  ], equation);
}
