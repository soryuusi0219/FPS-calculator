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
