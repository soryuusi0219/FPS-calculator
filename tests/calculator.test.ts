import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from '../src/workbook.ts';
import type { Calculation } from '../src/workbook.ts';
import { primeField, rationalField } from '../src/core/field.ts';
import { Series } from '../src/core/series.ts';

function workbook(sources: string[], options: Partial<Calculation> = {}) {
  return calculate({ rows: sources.map((source, i) => ({ id: String(i), source })), terms: 6, domain: 'rational', modulus: '998244353', basis: 'ogf', ...options });
}

function coefficients(source: string, options: Partial<Calculation> = {}): string[] {
  const result = workbook([source], options);
  assert.equal(result.error, undefined);
  assert.equal(result.rows[0]?.error, undefined);
  assert.ok(result.rows[0]?.coefficients);
  return result.rows[0].coefficients;
}

function scalar(source: string, options: Partial<Calculation> = {}): string {
  const result = workbook([source], options);
  assert.equal(result.error, undefined);
  assert.equal(result.rows[0]?.error, undefined);
  assert.equal(result.rows[0]?.valueType, 'scalar');
  return result.rows[0]!.value!;
}

test('有理数は安全整数の範囲を超えても厳密に計算し、既約分数に正規化する', () => {
  assert.equal(scalar('9007199254740993 + 1'), '9007199254740994');
  assert.equal(scalar('1/6 + 1/3 - 3/2'), '-1');
  const f = rationalField;
  assert.equal(f.format(f.div(f.fromInteger(6n), f.fromInteger(-8n))), '-3/4');
  assert.throws(() => f.div(f.one, f.zero), /0/);
});

test('素数体の正規化・逆元と素数性検証', () => {
  const f = primeField(7n);
  assert.equal(f.fromInteger(-2n), 5n);
  assert.equal(f.div(3n, 2n), 5n);
  for (const p of [0n, 1n, 4n, 9n, 561n, 2147483648n]) assert.throws(() => primeField(p));
  assert.equal(primeField(2147483647n).div(1n, 2n), 1073741824n);
});

test('四則演算・幾何級数・明示的乗算', () => {
  assert.deepEqual(coefficients('1/(1-x)'), ['1', '1', '1', '1', '1', '1']);
  assert.deepEqual(coefficients('(1+x)*(1-x)'), ['1', '0', '-1', '0', '0', '0']);
  assert.deepEqual(coefficients('(1+x)/(1-x)'), ['1', '2', '2', '2', '2', '2']);
});

test('単項演算子とべき乗の優先順位・負整数べき', () => {
  assert.deepEqual(coefficients('-x^2'), ['0', '0', '-1', '0', '0', '0']);
  assert.deepEqual(coefficients('(-x)^2'), ['0', '0', '1', '0', '0', '0']);
  assert.deepEqual(coefficients('(1-x)^-2'), ['1', '2', '3', '4', '5', '6']);
  assert.deepEqual(coefficients('x^0'), ['1', '0', '0', '0', '0', '0']);
  assert.match(workbook(['x^x']).rows[0]!.error!, /定数項が1/);
});

test('exp・logの既知の係数', () => {
  assert.deepEqual(coefficients('exp(x)'), ['1', '1', '1/2', '1/6', '1/24', '1/120']);
  assert.deepEqual(coefficients('log(1+x)'), ['0', '1', '-1/2', '1/3', '-1/4', '1/5']);
});

test('合成と合成逆関数のCatalan数', () => {
  assert.deepEqual(coefficients('compose(1/(1-x), x+x^2)'), ['1', '1', '2', '3', '5', '8']);
  assert.deepEqual(coefficients('revert(x-x^2)'), ['0', '1', '1', '2', '5', '14']);
  assert.deepEqual(coefficients('revert(2*x)'), ['0', '1/2', '0', '0', '0', '0']);
});

test('両係数体での形式的恒等式', () => {
  for (const domain of ['rational', 'prime'] as const) {
    for (const terms of [2, 5, 10]) {
      const settings = { domain, terms };
      const zero = Array<string>(terms).fill('0');
      for (const expression of [
        'exp(log(1+x+x^3))-(1+x+x^3)',
        'log(exp(x+x^2))-(x+x^2)',
        '(1-x+x^3)*inv(1-x+x^3)-1',
        'compose(x-x^2+x^3, revert(x-x^2+x^3))-x',
        'compose(revert(x-x^2+x^3), x-x^2+x^3)-x',
        'diff(integral(1/(1-x)))-1/(1-x)',
      ]) assert.deepEqual(coefficients(expression, settings), zero, `${domain}: ${expression}`);
    }
  }
});

test('必要精度を変数参照まで伝播し、微分の最高次係数を落とさない', () => {
  const result = workbook(['f = 1/(1-x)', 'g = diff(f)', 'diff(g)']);
  assert.deepEqual(result.rows[1]!.coefficients, ['1', '2', '3', '4', '5', '6']);
  assert.deepEqual(result.rows[2]!.coefficients, ['2', '6', '12', '20', '30', '42']);
});

test('名前の前方参照・式行・大文字Xを扱う', () => {
  const result = workbook(['g = f+X', 'f = 1/(1-x)', 'g-f']);
  assert.deepEqual(result.rows[0]!.coefficients, ['1', '2', '1', '1', '1', '1']);
  assert.deepEqual(result.rows[2]!.coefficients, ['0', '1', '0', '0', '0', '0']);
});

test('係数ごとの変換には係数aと添字nが使える', () => {
  assert.deepEqual(coefficients('map(1/(1-x)^2, a^2)'), ['1', '4', '9', '16', '25', '36']);
  assert.deepEqual(coefficients('map(1/(1-x), n*a)'), ['0', '1', '2', '3', '4', '5']);
  assert.deepEqual(coefficients('diff(map(1/(1-x), n^2))'), ['1', '8', '27', '64', '125', '216']);
  assert.match(workbook(['map(x, x)']).rows[0]!.error!, /スカラー/);
});

test('OGFとEGFは同一のFPSに対する表示基底の変更', () => {
  assert.deepEqual(coefficients('exp(x)', { basis: 'egf' }), ['1', '1', '1', '1', '1', '1']);
  assert.deepEqual(coefficients('1/(1-x)', { basis: 'egf' }), ['1', '1', '2', '6', '24', '120']);
  assert.deepEqual(coefficients('exp(x)', { basis: 'egf', domain: 'prime' }), ['1', '1', '1', '1', '1', '1']);
});

test('modは表示時の変換ではなく演算自体の係数体', () => {
  assert.deepEqual(coefficients('exp(x)', { domain: 'prime', modulus: '7' }), ['1', '1', '4', '6', '5', '1']);
  assert.deepEqual(coefficients('1/(1-x)^-1', { domain: 'prime', modulus: '2' }), ['1', '1', '0', '0', '0', '0']);
  assert.match(workbook(['exp(x)'], { domain: 'prime', modulus: '5' }).rows[0]!.error!, /逆元/);
  assert.match(workbook(['fps(1)'], { domain: 'prime', modulus: '5', basis: 'egf' }).rows[0]!.error!, /E.G.F/);
  assert.equal(scalar('1', { domain: 'prime', modulus: '5', basis: 'egf' }), '1');
});

test('操作の定数項・一次項条件を検証する', () => {
  for (const [expression, pattern] of [
    ['exp(1+x)', /f\(0\) = 0/],
    ['log(x)', /f\(0\) = 1/], ['compose(x, 1+x)', /g\(0\) = 0/],
    ['revert(x^2)', /\[x\]f/], ['revert(1+x)', /f\(0\)/],
  ] as const) assert.match(workbook([expression]).rows[0]!.error!, pattern);
});

test('循環・重複・未定義の名前を行ごとに報告する', () => {
  for (const rows of [['f = g', 'g = f'], ['f = diff(f)'], ['f = integral(f)']]) {
    for (const terms of [1, 6]) assert.match(workbook(rows, { terms }).rows[0]!.error!, /循環参照/);
  }
  assert.match(workbook(['f=1', 'f=2', 'f']).rows[2]!.error!, /複数/);
  assert.match(workbook(['missing+1']).rows[0]!.error!, /未定義/);
  assert.match(workbook(['integral(missing)'], { terms: 1 }).rows[0]!.error!, /未定義/);
  assert.deepEqual(workbook(['f=g', 'g=f', '1+x']).rows[2]!.coefficients, ['1', '1', '0', '0', '0', '0']);
});

test('不正な構文・引数・予約語を拒否し任意コードを実行しない', () => {
  for (const source of ['2x', '1.5', '(1+x', 'exp()', 'compose(x)', 'unknown(x)', 'toString(x)', 'x=1', 'n=1', 'exp=2', 'globalThis.alert(1)', 'x;1']) {
    assert.ok(workbook([source]).rows[0]!.error, source);
  }
  assert.equal(scalar('__proto__ = 2'), '2');
});

test('精度1と2の境界でも演算条件と出力長を保つ', () => {
  for (const source of ['exp(x)', 'log(1+x)', 'revert(x)', 'diff(x)', 'integral(1)', 'map(x,a+1)']) {
    assert.equal(coefficients(source, { terms: 1 }).length, 1);
    assert.equal(coefficients(source, { terms: 2 }).length, 2);
  }
  assert.deepEqual(coefficients('diff(x)', { terms: 1 }), ['1']);
});

test('入力予算とmodの形式を検証する', () => {
  for (const terms of [0, -1, 65, 1.5, NaN]) assert.ok(workbook(['x'], { terms }).error);
  assert.ok(workbook(Array<string>(31).fill('x')).error);
  assert.ok(workbook(['1'.repeat(513)]).rows[0]!.error);
  for (const modulus of ['-7', '7.0', '7e1', '99999999999999', '9']) assert.ok(workbook(['x'], { domain: 'prime', modulus }).error);
});

test('異なる精度のFPSの混用と根拠のない精度拡張を拒否する', () => {
  const a = Series.constant(rationalField, rationalField.one, 2);
  const b = Series.constant(rationalField, rationalField.one, 3);
  assert.throws(() => a.mul(b), /精度/);
  assert.throws(() => a.truncate(3), /精度/);
  assert.throws(() => a.pow(1.5), /指数/);
});
