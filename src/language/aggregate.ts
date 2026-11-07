import type { Field, Rational } from '../core/field.ts';
import { rationalField } from '../core/field.ts';
import { LaurentSeries } from '../core/laurent.ts';
import { MAX_AGGREGATE_TERMS, MAX_INTEGER_EXPONENT } from '../config/limits.ts';
import type { Expression } from './parser.ts';
import type { Lambda, Scalar, Value } from './values.ts';
import { infiniteBound, infiniteLast } from './infinite-bound.ts';

export interface AggregateRuntime<T> {
  field: Field<T>;
  evaluate(node: Expression, precision: number): Value<T>;
  invoke(lambda: Lambda<T>, index: number, precision: number): Value<T>;
  evaluateBody(lambda: Lambda<T>, node: Expression, precision: number): Value<T>;
  integer(value: Value<T>): bigint;
  scalar(exact: Rational, value: T): Scalar<T>;
}

/** 総和・総積はスカラーの厳密値とFPSの型を保ち、無限の尾には証明済み下界を要求する。 */
export function aggregate<T>(runtime: AggregateRuntime<T>, product: boolean, args: Expression[], precision: number): Value<T> {
  const f = runtime.field;
  const integer = (node: Expression) => {
    const n = runtime.integer(runtime.evaluate(node, 1));
    if (n < -BigInt(MAX_INTEGER_EXPONENT) || n > BigInt(MAX_INTEGER_EXPONENT)) throw new Error(`総和・総積の添字は±${MAX_INTEGER_EXPONENT}以内にしてください。`);
    return Number(n);
  };
  const start = integer(args[0]!);
  const infinite = args.length === 2;
  const lambda = runtime.evaluate(args.at(-1)!, precision);
  if (lambda.kind !== 'lambda' || lambda.parameters.length !== 1) throw new Error('総和・総積には添字を受け取る1引数のラムダが必要です。');
  let end: number;
  if (infinite) {
    if (start < 0) throw new Error('無限和・無限積の開始添字は非負にしてください。');
    const bound = infiniteBound(lambda.body, lambda.parameters[0]!, start, product, {
      integer: node => {
        const n = runtime.integer(runtime.evaluateBody(lambda, node, 1));
        if (n < -BigInt(MAX_INTEGER_EXPONENT) || n > BigInt(MAX_INTEGER_EXPONENT)) throw new Error('無限演算の次数の上限を超えました。');
        return Number(n);
      },
      order: node => {
        const value = runtime.evaluateBody(lambda, node, 1);
        if (value.kind === 'scalar') return f.equal(value.value, f.zero) ? 1 : 0;
        if (value.kind !== 'fps') throw new Error('無限演算の項にはスカラーまたはFPSが必要です。');
        if (value.series.startDegree < 0) throw new Error('無限演算には通常FPSを使ってください。');
        return value.series.orderBound;
      },
    });
    end = infiniteLast(start,precision,bound);
  } else end = integer(args[1]!);
  if (end - start + 1 > MAX_AGGREGATE_TERMS) throw new Error(`総和・総積は1回あたり${MAX_AGGREGATE_TERMS}項までです。`);
  const read = (n: number) => Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => {
    const value = runtime.invoke(lambda, start + i, n);
    if (value.kind !== 'scalar' && value.kind !== 'fps') throw new Error('総和・総積の項にはスカラーまたはFPSが必要です。');
    if (infinite && value.kind === 'fps' && value.series.startDegree < 0) throw new Error('無限演算には通常FPSを使ってください。');
    return value;
  });
  let values = read(precision);
  const negatives = (value: Scalar<T> | Extract<Value<T>, {kind:'fps'}>) => value.kind === 'fps' ? Math.min(0, value.series.orderBound) : 0;
  const extra = product ? -values.reduce((sum, value) => sum + negatives(value), 0) : 0;
  const working = precision + extra;
  if (extra) values = read(working);
  const identity = product ? rationalField.one : rationalField.zero;
  if (!infinite && values.every(value => value.kind === 'scalar')) {
    let exact = identity, value = product ? f.one : f.zero;
    for (const term of values) {
      if (term.kind !== 'scalar') throw new Error('総和・総積の型が変化しました。');
      exact = rationalField[product ? 'mul' : 'add'](exact, term.exact);
      value = f[product ? 'mul' : 'add'](value, term.value);
      // 巨大な中間値も通常のスカラーと同じサイズ制限で検証する。
      runtime.scalar(exact, value);
    }
    return runtime.scalar(exact, value);
  }
  let out = LaurentSeries.constant(f, product ? f.one : f.zero, working);
  let remaining = extra;
  for (const value of values) {
    const series = value.kind === 'fps' ? value.series : LaurentSeries.constant(f, value.value, working);
    remaining += negatives(value);
    out = product ? out.mul(series, precision + remaining) : out.add(series, precision);
  }
  return { kind: 'fps', series: out.truncate(precision) };
}
