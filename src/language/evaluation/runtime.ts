import type { Field, Rational } from '../../core/field.ts';
import type { LaurentSeries } from '../../core/laurent.ts';
import type { Expression } from '../parser.ts';
import type { Lambda, Scalar, Scope, Value } from '../values.ts';

/** 組み込み関数から評価器へ渡す処理。名前のキャッシュ・評価回数・診断は評価器に残す。 */
export interface BuiltinRuntime<T> {
  field: Field<T>;
  evaluate(node: Expression, precision: number, scope?: Scope<T>): Value<T>;
  lookup(name: string): Expression;
  integer(value: bigint): Scalar<T>;
  exactInteger(value: Value<T>): bigint;
  scalar(exact: Rational, value?: T): Scalar<T>;
  fromCoefficient(value: T): Scalar<T>;
  requireScalar(value: Value<T>): Scalar<T>;
  condition(value: Value<T>): boolean;
  series(value: Value<T>, precision: number, promote?: boolean): LaurentSeries<T>;
  invoke(lambda: Lambda<T>, args: Value<T>[], precision: number, extra?: Scope<T>): Value<T>;
  index(target: Expression, index: bigint): Scalar<T>;
  raise(producer: (precision: number) => Value<T>, exponent: bigint, precision: number): Value<T>;
  squareRoot(node: Expression, precision: number): Value<T>;
}
