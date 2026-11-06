import type { Field } from './field.ts';
import { rational } from './field.ts';
import { Series } from './series.ts';

/** C_n = binom(2n,n)/(n+1)。整数上で除算し、標数2等でも係数を保つ。 */
export function catalanSeries<T>(field: Field<T>, precision: number): Series<T> {
  let coefficient = 1n;
  return new Series(field, Array.from({ length: precision }, (_, n) => {
    if (n > 0) coefficient = coefficient * BigInt(4 * n - 2) / BigInt(n + 1);
    return field.fromInteger(coefficient);
  }));
}

/** W(f) = sum_{n>=1} (-n)^(n-1) f^n/n!、W(0)=0の枝。 */
export function lambertW<T>(input: Series<T>): Series<T> {
  const field = input.field;
  if (!field.equal(input.at(0), field.zero)) throw new Error('LambertW(f) は f(0) = 0 が必要です。');
  const valuation = input.coefficients.findIndex((value) => !field.equal(value, field.zero));
  let out = Series.constant(field, field.zero, input.precision);
  if (valuation < 0) return out;
  // fの位数に応じ、結果に寄与する次数だけの係数を要求する。
  const degree = Math.floor((input.precision - 1) / valuation);
  let factorial = 1n;
  const coefficients = [field.zero];
  for (let n = 1; n <= degree; n++) {
    factorial *= BigInt(n);
    const coefficient = rational((-BigInt(n)) ** BigInt(n - 1), factorial);
    coefficients.push(field.div(field.fromInteger(coefficient.numerator), field.fromInteger(coefficient.denominator)));
  }
  for (let n = degree; n >= 0; n--) out = out.mul(input).add(Series.constant(field, coefficients[n]!, input.precision));
  return out;
}
