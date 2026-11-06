import type { Series } from './series.ts';

export interface Affine<T> { constant: T; coefficients: T[] }
export interface Jet<T> { value: Series<T>; derivatives: Series<T>[] }
/** ソルバーが使う数学的な入出力。式言語・DOMには依存しない。 */
export interface ImplicitExpression<T> {
  run(values: Series<T>[], precision: number, differentiate: boolean): Jet<T>;
  affine(initial: readonly (T | undefined)[]): Affine<T> | undefined;
}
