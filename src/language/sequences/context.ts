import type { Field } from '../../core/field.ts';
import { LaurentSeries } from '../../core/laurent.ts';
import type { Expression } from '../parser.ts';
import type { FpsValue, Lambda, Value } from '../values.ts';

/** 評価器が提供するコールバック。数列関数はEvaluator自体に依存しない。 */
export interface SequenceRuntime<T> {
  field: Field<T>;
  evaluate(node: Expression, precision: number): Value<T>;
  integer(value: Value<T>): bigint;
  scalar(value: T): Value<T>;
  index(value: number): Value<T>;
  invoke(lambda: Lambda<T>, args: Value<T>[], precision: number): Value<T>;
  lookup(name: string): Expression;
}

/** 引数の型・添字・必要精度の共通処理。各関数の演算やレポートは所有しない。 */
export function createSequenceContext<T>(runtime: SequenceRuntime<T>, precision: number) {
  const field = runtime.field;
  const evaluate = (node: Expression, requested = precision) => runtime.evaluate(node, requested);

  function scalar(value: Value<T>): T {
    if (value.kind !== 'scalar') throw new Error('スカラー係数が必要です。');
    return value.value;
  }
  function integer(node: Expression, min: number, max: number): number {
    const n = runtime.integer(evaluate(node, 1));
    if (n < BigInt(min) || n > BigInt(max)) throw new Error(`整数は${min}〜${max}の範囲で指定してください。`);
    return Number(n);
  }
  function fps(coefficients: readonly T[], knownTerms?: number): FpsValue<T> {
    return {
      kind: 'fps', series: new LaurentSeries(field, coefficients),
      ...(knownTerms === undefined ? {} : { knownTerms }),
    };
  }
  function series(node: Expression, requested = precision) {
    const value = evaluate(node, requested);
    if (value.kind !== 'fps') throw new Error('通常FPSが必要です。seq(...) でも係数を入力できます。');
    return value.series.asPowerSeries();
  }
  function vector(node: Expression, count: number): T[] {
    const value = evaluate(node, count);
    if (value.kind !== 'fps') throw new Error('初期値・係数にはseq(...) またはFPSを指定してください。');
    if (value.knownTerms !== undefined && value.knownTerms < count) throw new Error(`${count}個の初期値・係数が必要です。`);
    return value.series.asPowerSeries().coefficients.slice(0, count);
  }
  return { field, runtime, precision, evaluate, scalar, integer, fps, series, vector };
}

export type SequenceContext<T> = ReturnType<typeof createSequenceContext<T>>;
