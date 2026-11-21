import { Series } from './series.ts';

/** exp(sum_{k>=1} f(x^k)/k)。整数の逆元がない標数では明示的に失敗する。 */
export function eulerTransform<T>(input: Series<T>): Series<T> {
  const f = input.field;
  if (!f.equal(input.at(0), f.zero)) throw new Error('eulerTransform(f) には f(0)=0 が必要です。');
  const logarithm = Array<T>(input.precision).fill(f.zero);
  for (let d = 1; d < input.precision; d++) {
    const a = input.at(d);
    for (let k = 1; k * d < input.precision; k++) {
      logarithm[k * d] = f.add(logarithm[k * d]!, f.div(a, f.fromInteger(BigInt(k))));
    }
  }
  return new Series(f, logarithm).exp();
}

/** log(g)[n] = sum_{k|n} f[n/k]/k を次数順に反転する。 */
export function inverseEulerTransform<T>(input: Series<T>): Series<T> {
  const field = input.field;
  if (!field.equal(input.at(0), field.one)) {
    throw new Error('inverseEulerTransform(f) には f(0)=1 が必要です。');
  }
  const coefficients = [...input.log().coefficients];
  for (let degree = 1; degree < input.precision; degree++) {
    for (let multiple = 2; multiple * degree < input.precision; multiple++) {
      const index = multiple * degree;
      const contribution = field.div(coefficients[degree]!, field.fromInteger(BigInt(multiple)));
      coefficients[index] = field.sub(coefficients[index]!, contribution);
    }
  }
  return new Series(field, coefficients);
}
