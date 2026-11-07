import { LaurentSeries } from '../../core/laurent.ts';
import { egfWeights } from '../../core/analytic-coefficients.ts';
import { degreeRange } from '../degree-range.ts';
import type { Expression } from '../parser.ts';
import type { Lambda, Scope, Value } from '../values.ts';
import type { BuiltinRuntime } from './runtime.ts';

/** fps/egf生成は通常係数へ写し、表示基底から独立させる。 */
export function generateSeries<T>(runtime: BuiltinRuntime<T>, name: string, args: Expression[], precision: number): Value<T> {
  const arg = args[0]!;
  const evaluate = (node: Expression, requested = precision) => runtime.evaluate(node, requested);
  const value = evaluate(arg);
  if (value.kind !== 'lambda') {
    if (args.length !== 1) throw new Error(`${name} の次数範囲はラムダ生成の場合に指定してください。`);
    const series = runtime.series(value, precision);
    series.asPowerSeries();
    if (name === 'egf' && value.kind === 'fps') {
      const weight = egfWeights(runtime.field);
      return {
        kind: 'fps', series: new LaurentSeries(runtime.field, series.coefficients.map((a, n) => weight(n, a))),
        ...(value.knownTerms === undefined ? {} : { knownTerms: value.knownTerms }),
      };
    }
    return { kind: 'fps', series };
  }
  if (value.parameters.length !== 1) throw new Error(`${name} のラムダは次数を受け取る1引数にしてください。`);
  const [start, end] = degreeRange(args, node => runtime.exactInteger(evaluate(node, 1)));
  const weight = name === 'egf' ? egfWeights(runtime.field) : (_n: number, a: T) => a;
  const coefficients = Array.from({ length: precision }, (_, n) => n < start || n > end
    ? runtime.field.zero
    : weight(n, runtime.requireScalar(runtime.invoke(value, [runtime.integer(BigInt(n))], precision)).value));
  return { kind: 'fps', series: new LaurentSeries(runtime.field, coefficients) };
}

/** mapの局所束縛・隣接係数参照・要求精度をまとめて扱う。 */
export function mapCoefficients<T>(runtime: BuiltinRuntime<T>, source: Expression, transform: Expression, precision: number, scope: Scope<T>): Value<T> {
  const sourceSeries = runtime.series(runtime.evaluate(source, precision, scope), precision, false);
  let lambda: Lambda<T> | undefined;
  if (transform.kind === 'lambda' || transform.kind === 'symbol' && !['a', 'n', 'i'].includes(transform.name)) {
    const candidate = runtime.evaluate(transform, precision, scope);
    if (candidate.kind === 'lambda') lambda = candidate;
  }
  if (lambda && lambda.parameters.length !== 1 && lambda.parameters.length !== 2) throw new Error('map のラムダは n または (a,n) の1〜2引数にしてください。');
  const coefficients = Array.from({ length: precision - sourceSeries.startDegree }, (_, offset) => {
    const n = offset + sourceSeries.startDegree;
    const a = runtime.fromCoefficient(sourceSeries.at(n));
    a.coefficient = (k) => runtime.index(source, BigInt(k));
    const index = runtime.integer(BigInt(n));
    const extra = new Map<string, Value<T>>([['a', a], ['n', index], ['i', index]]);
    const value = lambda
      ? runtime.invoke(lambda, lambda.parameters.length === 1 ? [index] : [a, index], precision, extra)
      : runtime.evaluate(transform, precision, new Map([...scope, ...extra]));
    return runtime.requireScalar(value).value;
  });
  return { kind: 'fps', series: new LaurentSeries(runtime.field, coefficients, sourceSeries.startDegree) };
}
