import type { Field, Rational } from './field.ts';
import { rational, rationalField } from './field.ts';

export type AnalyticKernel = 'sin' | 'cos' | 'sinh' | 'cosh' | 'arcsin' | 'arctan' | 'arcsinh' | 'arctanh';
export type AnalyticFunction = AnalyticKernel | 'tan' | 'cot' | 'sec' | 'csc' | 'tanh' | 'coth' | 'sech' | 'csch'
  | 'arccos' | 'arccot' | 'arcsec' | 'arccsc' | 'arccosh' | 'arccoth' | 'arcsech' | 'arccsch';

const cache = new Map<AnalyticKernel, Rational[]>();
/** 原点でのTaylor係数。約分を済ませてから係数体へ写し、不要な分母を要求しない。 */
export function analyticCoefficient(name: AnalyticKernel, degree: number): Rational {
  let values = cache.get(name);
  if (!values) { values = [name === 'cos' || name === 'cosh' ? rationalField.one : rationalField.zero]; cache.set(name, values); }
  while (values.length <= degree) {
    const n = values.length;
    let value = rationalField.zero;
    if (name === 'sin' || name === 'cos' || name === 'sinh' || name === 'cosh') {
      if (n === 1) value = name === 'sin' || name === 'sinh' ? rationalField.one : rationalField.zero;
      else value = rationalField.mul(values[n-2]!, rational(name === 'sin' || name === 'cos' ? -1n : 1n, BigInt(n*(n-1))));
    } else if (n % 2 === 1) {
      if (name === 'arctan' || name === 'arctanh') value = rational(name === 'arctan' && n % 4 === 3 ? -1n : 1n, BigInt(n));
      else value = n === 1 ? rationalField.one : rationalField.mul(values[n-2]!, rational(BigInt((name === 'arcsinh' ? -1 : 1)*(n-2)**2), BigInt(n*(n-1))));
    }
    values.push(value);
  }
  return values[degree]!;
}

export function kernelCoefficient<T>(field: Field<T>, name: AnalyticKernel, degree: number, derivative=false): T {
  let value = analyticCoefficient(name, degree+(derivative?1:0));
  if(derivative)value=rational(value.numerator*BigInt(degree+1),value.denominator);
  return field.div(field.fromInteger(value.numerator), field.fromInteger(value.denominator));
}

/** EGFの重みを通常係数へ写す。標数でn!が0の場合は曖昧な持ち上げをしない。 */
export function egfWeights<T>(field: Field<T>): (degree: number, value: T) => T {
  const factorials = [field.one];
  return (n, value) => {
    while (factorials.length <= n) factorials.push(field.mul(factorials.at(-1)!, field.fromInteger(BigInt(factorials.length))));
    if (field.equal(factorials[n]!, field.zero)) throw new Error(`EGF生成では ${n}! の逆元が係数体に必要です。この標数では計算できません。`);
    return field.div(value, factorials[n]!);
  };
}
