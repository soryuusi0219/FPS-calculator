/** FPS演算が必要とする係数体。UIや構文木には依存しない。 */
export interface Field<T> {
  readonly zero: T;
  readonly one: T;
  fromInteger(value: bigint): T;
  add(a: T, b: T): T;
  sub(a: T, b: T): T;
  mul(a: T, b: T): T;
  div(a: T, b: T): T;
  equal(a: T, b: T): boolean;
  format(value: T): string;
  asRational(value: T): Rational;
  sqrt(value: T): T;
}

export interface Rational {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

export function rational(n: bigint, d = 1n): Rational {
  if (d === 0n) throw new Error('0 で割ることはできません。');
  if (d < 0n) [n, d] = [-n, -d];
  const g = gcd(n, d);
  return { numerator: n / g, denominator: d / g };
}

export const rationalField: Field<Rational> = {
  zero: rational(0n),
  one: rational(1n),
  fromInteger: rational,
  add: (a, b) => rational(a.numerator * b.denominator + b.numerator * a.denominator, a.denominator * b.denominator),
  sub: (a, b) => rational(a.numerator * b.denominator - b.numerator * a.denominator, a.denominator * b.denominator),
  mul: (a, b) => rational(a.numerator * b.numerator, a.denominator * b.denominator),
  div: (a, b) => rational(a.numerator * b.denominator, a.denominator * b.numerator),
  equal: (a, b) => a.numerator === b.numerator && a.denominator === b.denominator,
  format: (a) => a.denominator === 1n ? `${a.numerator}` : `${a.numerator}/${a.denominator}`,
  asRational: (a) => a,
  sqrt(a) {
    const n = exactRoot(a.numerator, 2);
    const d = exactRoot(a.denominator, 2);
    if (n === null || d === null) throw new Error('この値の平方根は有理数体に存在しません。');
    return rational(n, d);
  },
};

export function exactRoot(value: bigint, degree: number): bigint | null {
  if (!Number.isInteger(degree) || degree < 1 || degree > 64) throw new Error('根の次数は 1〜64 に制限しています。');
  if (value < 0n) {
    if (degree % 2 === 0) return null;
    const positive = exactRoot(-value, degree);
    return positive === null ? null : -positive;
  }
  if (value === 0n || degree === 1) return value;
  const q = BigInt(degree);
  let root = 1n << BigInt(Math.ceil(value.toString(2).length / degree));
  while (true) {
    const next = ((q - 1n) * root + value / root ** (q - 1n)) / q;
    if (next >= root) break;
    root = next;
  }
  return root ** q === value ? root : null;
}

function modularPower(a: bigint, exponent: bigint, p: bigint): bigint {
  let result = 1n;
  while (exponent > 0n) {
    if (exponent % 2n) result = result * a % p;
    a = a * a % p; exponent /= 2n;
  }
  return result;
}

/** Tonelli–Shanks。二つある根のうち、小さい非負代表元を選択。 */
function modularSqrt(a: bigint, p: bigint): bigint {
  if (a === 0n || p === 2n) return a;
  if (modularPower(a, (p - 1n) / 2n, p) !== 1n) throw new Error('この値の平方根は指定した素数体に存在しません。');
  let q = p - 1n; let s = 0;
  while (q % 2n === 0n) { q /= 2n; s++; }
  let z = 2n;
  while (modularPower(z, (p - 1n) / 2n, p) === 1n) z++;
  let c = modularPower(z, q, p);
  let x = modularPower(a, (q + 1n) / 2n, p);
  let t = modularPower(a, q, p);
  let m = s;
  while (t !== 1n) {
    let i = 0; let power = t;
    while (power !== 1n) { power = power * power % p; i++; }
    const b = modularPower(c, 1n << BigInt(m - i - 1), p);
    x = x * b % p; c = b * b % p; t = t * c % p; m = i;
  }
  return x < p - x ? x : p - x;
}

/** 小規模な初期実装では31 bit以下に制限し、試し割りで素数性を確定する。 */
export function primeField(p: bigint): Field<bigint> {
  if (p < 2n || p > 2147483647n) throw new Error('mod は 2 以上 2147483647 以下の素数を指定してください。');
  for (let d = 2n; d * d <= p; d += d === 2n ? 1n : 2n) {
    if (p % d === 0n) throw new Error('mod に合成数は指定できません。素数を指定してください。');
  }
  const normalize = (a: bigint) => ((a % p) + p) % p;
  return {
    zero: 0n,
    one: 1n,
    fromInteger: normalize,
    add: (a, b) => normalize(a + b),
    sub: (a, b) => normalize(a - b),
    mul: (a, b) => normalize(a * b),
    div(a, b) {
      b = normalize(b);
      if (b === 0n) throw new Error('mod 上で 0 の逆元は存在しません。');
      let [oldR, r, oldS, s] = [p, b, 0n, 1n];
      while (r !== 0n) {
        const q = oldR / r;
        [oldR, r] = [r, oldR - q * r];
        [oldS, s] = [s, oldS - q * s];
      }
      return normalize(a * oldS);
    },
    equal: (a, b) => a === b,
    format: String,
    asRational: (a) => rational(a),
    sqrt: (a) => modularSqrt(normalize(a), p),
  };
}
