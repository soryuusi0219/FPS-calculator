import type { Field } from './field.ts';
import { MAX_INTEGER_EXPONENT } from '../config/limits.ts';

/** coefficients[i] = [x^i] f。length=N は mod x^N の精度を表す。 */
export class Series<T> {
  readonly field: Field<T>;
  readonly coefficients: readonly T[];

  constructor(field: Field<T>, coefficients: readonly T[]) {
    if (coefficients.length < 1) throw new Error('FPS の精度は 1 以上が必要です。');
    this.field = field;
    this.coefficients = [...coefficients];
  }

  get precision(): number { return this.coefficients.length; }
  at(i: number): T { return this.coefficients[i] ?? this.field.zero; }

  static constant<T>(field: Field<T>, value: T, precision: number): Series<T> {
    if (!Number.isSafeInteger(precision) || precision < 1) throw new Error('FPS の精度は正の整数で指定してください。');
    return new Series(field, Array.from({ length: precision }, (_, i) => i === 0 ? value : field.zero));
  }

  private compatible(other: Series<T>): void {
    if (this.field !== other.field || this.precision !== other.precision) {
      throw new Error('係数体と精度を揃えてから演算してください。');
    }
  }

  add(other: Series<T>): Series<T> {
    this.compatible(other);
    return new Series(this.field, this.coefficients.map((a, i) => this.field.add(a, other.at(i))));
  }

  neg(): Series<T> {
    return new Series(this.field, this.coefficients.map((a) => this.field.sub(this.field.zero, a)));
  }

  sub(other: Series<T>): Series<T> { return this.add(other.neg()); }

  mul(other: Series<T>): Series<T> {
    this.compatible(other);
    const f = this.field;
    const out = Array<T>(this.precision).fill(f.zero);
    for (let i = 0; i < this.precision; i++) {
      for (let j = 0; i + j < this.precision; j++) {
        out[i + j] = f.add(out[i + j]!, f.mul(this.at(i), other.at(j)));
      }
    }
    return new Series(f, out);
  }

  inv(): Series<T> {
    const f = this.field;
    if (f.equal(this.at(0), f.zero)) throw new Error('inv・除算には分母の定数項が非零であることが必要です。');
    const out = [f.div(f.one, this.at(0))];
    for (let n = 1; n < this.precision; n++) {
      let sum = f.zero;
      for (let k = 1; k <= n; k++) sum = f.add(sum, f.mul(this.at(k), out[n - k]!));
      out.push(f.div(f.sub(f.zero, sum), this.at(0)));
    }
    return new Series(f, out);
  }

  div(other: Series<T>): Series<T> { return this.mul(other.inv()); }

  pow(exponent: number): Series<T> {
    if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > MAX_INTEGER_EXPONENT) throw new Error(`指数は -${MAX_INTEGER_EXPONENT}〜${MAX_INTEGER_EXPONENT} の整数リテラルにしてください。`);
    let base: Series<T> = exponent < 0 ? this.inv() : this;
    let out = Series.constant(this.field, this.field.one, this.precision);
    let n = Math.abs(exponent);
    while (n > 0) {
      if (n % 2 === 1) out = out.mul(base);
      n = Math.floor(n / 2);
      if (n > 0) base = base.mul(base);
    }
    return out;
  }

  exp(): Series<T> {
    const f = this.field;
    if (!f.equal(this.at(0), f.zero)) throw new Error('exp(f) は f(0) = 0 の場合に対応しています。');
    const out = [f.one];
    for (let n = 1; n < this.precision; n++) {
      let sum = f.zero;
      for (let k = 1; k <= n; k++) sum = f.add(sum, f.mul(f.mul(f.fromInteger(BigInt(k)), this.at(k)), out[n - k]!));
      out.push(f.div(sum, f.fromInteger(BigInt(n))));
    }
    return new Series(f, out);
  }

  log(): Series<T> {
    const f = this.field;
    if (!f.equal(this.at(0), f.one)) throw new Error('log(f) は f(0) = 1 の場合に対応しています。');
    const out = [f.zero];
    for (let n = 1; n < this.precision; n++) {
      let value = f.mul(f.fromInteger(BigInt(n)), this.at(n));
      for (let k = 1; k < n; k++) value = f.sub(value, f.mul(f.mul(f.fromInteger(BigInt(k)), out[k]!), this.at(n - k)));
      out.push(f.div(value, f.fromInteger(BigInt(n))));
    }
    return new Series(f, out);
  }

  compose(inner: Series<T>): Series<T> {
    this.compatible(inner);
    if (!this.field.equal(inner.at(0), this.field.zero)) throw new Error('compose(f, g) は g(0) = 0 が必要です。');
    let out = Series.constant(this.field, this.field.zero, this.precision);
    for (let i = this.precision - 1; i >= 0; i--) {
      out = out.mul(inner).add(Series.constant(this.field, this.at(i), this.precision));
    }
    return out;
  }

  /** 入力の位数が2mなら、出力N項には入力N+m項が必要。 */
  sqrt(precision = this.precision): Series<T> {
    const f = this.field;
    if (f.equal(f.fromInteger(2n), f.zero)) throw new Error('FPSの平方根は標数2には未対応です。');
    const valuation = this.coefficients.findIndex((a) => !f.equal(a, f.zero));
    if (valuation === -1) {
      if (this.precision < 2 * precision) throw new Error('零FPSの平方根を確定する入力精度が不足しています。');
      return Series.constant(f, f.zero, precision);
    }
    if (valuation % 2) throw new Error('平方根にはFPSの最初の非零項の次数が偶数であることが必要です。');
    const shift = valuation / 2;
    if (this.precision < precision + shift) throw new Error('平方根の計算に必要な入力精度が不足しています。');
    const out = Array<T>(precision).fill(f.zero);
    if (shift >= precision) return new Series(f, out);
    const root = f.sqrt(this.at(valuation));
    out[shift] = root;
    for (let n = 1; n + shift < precision; n++) {
      let value = this.at(valuation + n);
      for (let k = 1; k < n; k++) value = f.sub(value, f.mul(out[shift + k]!, out[shift + n - k]!));
      out[shift + n] = f.div(value, f.mul(f.fromInteger(2n), root));
    }
    return new Series(f, out);
  }

  /** Lagrange反転: [x^k] revert(f) = [t^(k-1)] (t/f(t))^k / k。 */
  revert(): Series<T> {
    const f = this.field;
    if (!f.equal(this.at(0), f.zero) || f.equal(this.at(1), f.zero)) throw new Error('revert(f) は f(0) = 0 かつ [x]f ≠ 0 が必要です。');
    // x/f(x) はN-1項まで既知。それ以上の精度を仮定しない。
    const h = new Series(f, this.coefficients.slice(1)).inv();
    let power = Series.constant(f, f.one, h.precision);
    const out = [f.zero];
    for (let k = 1; k < this.precision; k++) {
      power = power.mul(h);
      out.push(f.div(power.at(k - 1), f.fromInteger(BigInt(k))));
    }
    return new Series(f, out);
  }

  /** 失われた最高次の係数を0と見なさない。呼び出し側が必要精度+1を用意する。 */
  derivative(): Series<T> {
    if (this.precision < 2) throw new Error('微分には入力の精度が 2 以上必要です。');
    return new Series(this.field, this.coefficients.slice(1).map((a, i) => this.field.mul(a, this.field.fromInteger(BigInt(i + 1)))));
  }

  integral(): Series<T> {
    return new Series(this.field, [this.field.zero, ...this.coefficients.map((a, i) => this.field.div(a, this.field.fromInteger(BigInt(i + 1))))]);
  }

  truncate(precision: number): Series<T> {
    if (!Number.isSafeInteger(precision) || precision < 1) throw new Error('FPS の精度は正の整数で指定してください。');
    if (precision > this.precision) throw new Error('不足する精度をゼロ埋めで増やすことはできません。');
    return new Series(this.field, this.coefficients.slice(0, precision));
  }
}
