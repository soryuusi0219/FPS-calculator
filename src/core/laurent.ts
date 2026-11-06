import type { Field } from './field.ts';
import { Series } from './series.ts';
import { MAX_INTEGER_EXPONENT, MAX_POLE_ORDER } from '../config/limits.ts';
export { MAX_INTERNAL_PRECISION, MAX_POLE_ORDER } from '../config/limits.ts';

/** coefficients[i]=[x^(startDegree+i)]f、未知の項は O(x^precision)。 */
export class LaurentSeries<T> {
  readonly field: Field<T>;
  readonly startDegree: number;
  readonly coefficients: readonly T[];

  constructor(field: Field<T>, coefficients: readonly T[], startDegree = 0) {
    if (!Number.isSafeInteger(startDegree) || coefficients.length + startDegree < 1) throw new Error('級数の打ち切り精度は正の整数で指定してください。');
    let values = [...coefficients];
    while (startDegree < 0 && field.equal(values[0]!, field.zero)) { values.shift(); startDegree++; }
    if (startDegree < -MAX_POLE_ORDER) throw new Error(`Laurent級数の負の次数は -${MAX_POLE_ORDER} までです。`);
    if (startDegree > 0) { values = [...Array<T>(startDegree).fill(field.zero), ...values]; startDegree = 0; }
    this.field = field;
    this.startDegree = startDegree;
    this.coefficients = values;
  }

  get precision(): number { return this.startDegree + this.coefficients.length; }
  get valuation(): number {
    const index = this.coefficients.findIndex((a) => !this.field.equal(a, this.field.zero));
    return index < 0 ? Infinity : this.startDegree + index;
  }
  /** すべて0でも恒等的な零とは断定せず、既知の位数の下限を使う。 */
  get orderBound(): number { return Math.min(this.valuation, this.precision); }

  at(degree: number): T {
    if (degree >= this.precision) throw new Error('未知の高次係数は取得できません。必要な精度で再評価してください。');
    return degree < this.startDegree ? this.field.zero : this.coefficients[degree - this.startDegree]!;
  }

  static constant<T>(field: Field<T>, value: T, precision: number): LaurentSeries<T> {
    return new LaurentSeries(field, Series.constant(field, value, precision).coefficients);
  }
  private compatible(other: LaurentSeries<T>): void {
    if (this.field !== other.field) throw new Error('係数体を揃えてから演算してください。');
  }
  private known(precision: number): void {
    if (precision > this.precision) throw new Error('級数の入力精度が不足しています。');
  }
  private unit(valuation: number, length: number): Series<T> {
    this.known(valuation + length);
    return new Series(this.field, Array.from({ length }, (_, i) => this.at(valuation + i)));
  }
  truncate(precision: number): LaurentSeries<T> {
    if (!Number.isInteger(precision) || precision < 1) throw new Error('級数の精度は正の整数で指定してください。');
    this.known(precision);
    return new LaurentSeries(this.field, this.coefficients.slice(0, precision - this.startDegree), this.startDegree);
  }
  asPowerSeries(): Series<T> {
    if (this.startDegree < 0) throw new Error('この演算は負の次数を持つLaurent級数には対応していません。');
    return new Series(this.field, this.coefficients);
  }
  neg(): LaurentSeries<T> { return new LaurentSeries(this.field, this.coefficients.map((a) => this.field.sub(this.field.zero, a)), this.startDegree); }
  add(other: LaurentSeries<T>, precision = Math.min(this.precision, other.precision)): LaurentSeries<T> {
    this.compatible(other); this.known(precision); other.known(precision);
    const start = Math.min(this.startDegree, other.startDegree);
    return new LaurentSeries(this.field, Array.from({ length: precision - start }, (_, i) => this.field.add(this.at(start + i), other.at(start + i))), start);
  }
  sub(other: LaurentSeries<T>, precision = Math.min(this.precision, other.precision)): LaurentSeries<T> { return this.add(other.neg(), precision); }
  mul(other: LaurentSeries<T>, precision = Math.min(this.precision, other.precision)): LaurentSeries<T> {
    this.compatible(other);
    if (precision > Math.min(this.precision + other.orderBound, other.precision + this.orderBound)) throw new Error('Laurent級数の乗算に必要な入力精度が不足しています。');
    const start = Math.min(0, this.orderBound + other.orderBound);
    if (start < -MAX_POLE_ORDER) throw new Error(`Laurent級数の負の次数は -${MAX_POLE_ORDER} までです。`);
    const out = Array<T>(precision - start).fill(this.field.zero);
    for (let i = 0; i < this.coefficients.length; i++) {
      const a = this.coefficients[i]!;
      if (this.field.equal(a, this.field.zero)) continue;
      for (let j = 0; j < other.coefficients.length; j++) {
        const degree = this.startDegree + i + other.startDegree + j;
        if (degree >= precision) break;
        const b = other.coefficients[j]!;
        if (this.field.equal(b, this.field.zero)) continue;
        out[degree - start] = this.field.add(out[degree - start]!, this.field.mul(a, b));
      }
    }
    return new LaurentSeries(this.field, out, start);
  }
  div(other: LaurentSeries<T>, precision: number): LaurentSeries<T> {
    this.compatible(other);
    const a = this.valuation; const b = other.valuation;
    if (!Number.isFinite(b)) throw new Error('分母の非零項が確認できません。0による除算はできません。');
    this.known(precision + b);
    if (!Number.isFinite(a) || a - b >= precision) return LaurentSeries.constant(this.field, this.field.zero, precision);
    const length = precision - a + b;
    return new LaurentSeries(this.field, this.unit(a, length).div(other.unit(b, length)).coefficients, a - b);
  }
  pow(exponent: number, precision: number): LaurentSeries<T> {
    if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > MAX_INTEGER_EXPONENT) throw new Error(`整数の指数は -${MAX_INTEGER_EXPONENT}〜${MAX_INTEGER_EXPONENT} に制限しています。`);
    if (exponent === 0) return LaurentSeries.constant(this.field, this.field.one, precision);
    const valuation = this.valuation;
    if (!Number.isFinite(valuation)) {
      if (exponent > 0 && this.precision * exponent >= precision) return LaurentSeries.constant(this.field, this.field.zero, precision);
      throw new Error('逆元の計算に必要な非零項を確認できません。');
    }
    const shift = valuation * exponent;
    if (shift >= precision) return LaurentSeries.constant(this.field, this.field.zero, precision);
    if (shift < -MAX_POLE_ORDER) throw new Error(`Laurent級数の負の次数は -${MAX_POLE_ORDER} までです。`);
    return new LaurentSeries(this.field, this.unit(valuation, precision - shift).pow(exponent).coefficients, shift);
  }
  derivative(): LaurentSeries<T> {
    const start = Math.min(0, this.startDegree - 1);
    return new LaurentSeries(this.field, Array.from({ length: this.precision - 1 - start }, (_, i) => {
      const degree = start + i;
      return this.field.mul(this.at(degree + 1), this.field.fromInteger(BigInt(degree + 1)));
    }), start);
  }
  integral(): LaurentSeries<T> {
    if (!this.field.equal(this.at(-1), this.field.zero)) throw new Error('x^(-1) の積分には log(x) が必要なため、Laurent級数の範囲では計算できません。');
    const start = Math.min(0, this.startDegree + 1);
    return new LaurentSeries(this.field, Array.from({ length: this.precision + 1 - start }, (_, i) => {
      const degree = start + i;
      return degree === 0 ? this.field.zero : this.field.div(this.at(degree - 1), this.field.fromInteger(BigInt(degree)));
    }), start);
  }
  exp(): LaurentSeries<T> { return new LaurentSeries(this.field, this.asPowerSeries().exp().coefficients); }
  log(): LaurentSeries<T> { return new LaurentSeries(this.field, this.asPowerSeries().log().coefficients); }
  sqrt(precision: number): LaurentSeries<T> { return new LaurentSeries(this.field, this.asPowerSeries().sqrt(precision).coefficients); }
  revert(): LaurentSeries<T> { return new LaurentSeries(this.field, this.asPowerSeries().revert().coefficients); }
  compose(inner: LaurentSeries<T>): LaurentSeries<T> { return new LaurentSeries(this.field, this.asPowerSeries().compose(inner.asPowerSeries()).coefficients); }
}
