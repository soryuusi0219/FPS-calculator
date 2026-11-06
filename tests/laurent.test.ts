import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToString } from 'katex';
import { calculate } from '../src/workbook.ts';
import type { Calculation, RowResult } from '../src/workbook.ts';
import { LaurentSeries } from '../src/core/laurent.ts';
import { rationalField } from '../src/core/field.ts';
import { seriesTex } from '../src/language/tex.ts';

function workbook(sources: string[], options: Partial<Calculation> = {}): RowResult[] {
  const result = calculate({ rows: sources.map((source, i) => ({ id: String(i), source })), terms: 6, domain: 'rational', basis: 'ogf', modulus: '998244353', ...options });
  assert.equal(result.error, undefined);
  return result.rows;
}
function result(source: string, options: Partial<Calculation> = {}): RowResult {
  const row = workbook([source], options)[0]!;
  assert.equal(row.error, undefined, source);
  return row;
}
function series(source: string, startDegree: number, coefficients: string[], options: Partial<Calculation> = {}): void {
  const row = result(source, options);
  assert.equal(row.valueType, startDegree < 0 ? 'laurent' : 'fps', source);
  assert.equal(row.startDegree, startDegree, source);
  assert.deepEqual(row.coefficients, coefficients, source);
}

test('定数項0の分母をLaurent級数として割り、共通のx因子も相殺する', () => {
  series('1/x', -1, ['1', '0', '0', '0', '0', '0', '0']);
  series('x/x', 0, ['1', '0', '0', '0', '0', '0']);
  series('x^2/x', 0, ['0', '1', '0', '0', '0', '0']);
  series('x/x^2', -1, ['1', '0', '0', '0', '0', '0', '0']);
  series('1/(x*(1-x))', -1, Array(7).fill('1'));
  series('1/(x^2+x^3)', -2, ['1', '-1', '1', '-1', '1', '-1', '1', '-1']);
  series('0/x', 0, Array(6).fill('0'));
});

test('乗法逆元・負整数べきにもLaurent級数の精度を伝播する', () => {
  series('inv(x-x^2)', -1, Array(7).fill('1'));
  series('(x+x^2)^-2', -2, ['1', '-2', '3', '-4', '5', '-6', '7', '-8']);
  series('(1/x+1)^3', -3, ['1', '3', '3', '1', '0', '0', '0', '0', '0']);
  series('1/(1/x+1)', 0, ['0', '1', '-1', '1', '-1', '1']);
  series('inv(inv(x))', 0, ['0', '1', '0', '0', '0', '0']);
  series('(x^2)^(-1/2)', -1, ['1', '0', '0', '0', '0', '0', '0']);
});

test('負の次数との乗算・正の位数での除算で末尾の係数を落とさない', () => {
  series('exp(x)/x', -1, ['1', '1', '1/2', '1/6', '1/24', '1/120', '1/720']);
  series('x^-2*exp(x)', -2, ['1', '1', '1/2', '1/6', '1/24', '1/120', '1/720', '1/5040']);
  series('(exp(x)-1)/x', 0, ['1', '1/2', '1/6', '1/24', '1/120', '1/720']);
  series('(1/x)/(1/x^2)', 0, ['0', '1', '0', '0', '0', '0']);
  const rows = workbook(['f=exp(x)', 'g=f/x^2', 'x^-1*g']);
  assert.equal(rows[2]!.startDegree, -3);
  assert.equal(rows[2]!.coefficients!.at(-1), '1/40320');
});

test('有理数体と素数体でLaurent級数の形式的恒等式を保つ', () => {
  for (const domain of ['rational', 'prime'] as const) {
    for (const terms of [1, 4, 8]) {
      const options = { domain, terms, modulus: '17' };
      for (const source of [
        '1/(x+x^3)*(x+x^3)-1',
        '(x+x^3)^-2*(x+x^3)^2-1',
        '1/(x*(1-x))*x-1/(1-x)',
        '(exp(x)-1)/x*x-exp(x)+1',
        'inv(1/(x*(1-x)))-x*(1-x)',
        'diff(1/(x*(1-x)))+x^-2-1/(1-x)^2',
        'diff(integral(x^-2+1+x))-(x^-2+1+x)',
        '(1+x^2)^(1/x)-exp(log(1+x^2)/x)',
      ]) series(source, 0, Array(terms).fill('0'), options);
    }
  }
});

test('単項式と幾何級数の商を独立した係数公式と照合する', () => {
  for (const domain of ['rational', 'prime'] as const) {
    for (let a = 0; a <= 5; a++) {
      for (let b = 0; b <= 5; b++) {
        const start = Math.min(0, a - b);
        const expected = Array.from({ length: 4 - start }, (_, i) => start + i >= a - b ? '1' : '0');
        series(`x^${a}/(x^${b}*(1-x))`, start, expected, { terms: 4, domain, modulus: '2' });
      }
    }
  }
});

test('有限体上の実際の位数で割り、零になった先頭係数を飛ばす', () => {
  series('1/(3*x+x^2)', -2, ['1', '0', '0', '0', '0', '0', '0', '0'], { domain: 'prime', modulus: '3' });
  series('1/(2*x*(1+x))', -1, ['4', '3', '4', '3', '4', '3', '4'], { domain: 'prime', modulus: '7' });
  assert.match(workbook(['1/(7*x)'], { domain: 'prime', modulus: '7' })[0]!.error!, /零級数|0/);
});

test('負の次数の係数をスカラーとして抽出し、名前参照とmapも扱う', () => {
  const rows = workbook(['f=exp(x)/x', 'f[-1]', 'coeff(f,-2)', 'f[4]'], { terms: 1 });
  assert.equal(rows[1]!.value, '1');
  assert.equal(rows[2]!.value, '0');
  assert.equal(rows[3]!.value, '1/120');
  series('map(1/(x*(1-x)),(a,n)=>n*a)', -1, ['-1', '0', '1', '2', '3', '4', '5']);
  series('map(1/(x*(1-x)),(a,n)=>n<0?0:n!*a)', 0, ['1', '1', '2', '6', '24', '120']);
  assert.equal(result('coeff(1/x,-1)', { basis: 'egf' }).value, '1');
});

test('負の項を相殺した結果は通常FPSに戻る', () => {
  series('1/x-1/x', 0, Array(6).fill('0'));
  series('1/(x*(1-x))-1/x', 0, Array(6).fill('1'));
  series('exp(1/x-1/x)', 0, ['1', '0', '0', '0', '0', '0']);
  series('x/x', 0, ['1', '0', '0', '0', '0', '0'], { basis: 'egf' });
});

test('Laurent級数の微積分と、Laurentの範囲外になるlog項を区別する', () => {
  series('diff(1/(x*(1-x)))', -2, ['-1', '0', '1', '2', '3', '4', '5', '6']);
  series('integral(x^-2)', -1, ['-1', '0', '0', '0', '0', '0', '0']);
  assert.match(workbook(['integral(1/x)'])[0]!.error!, /log\(x\)/);
  assert.match(workbook(['1/x'], { basis: 'egf' })[0]!.error!, /O.G.F/);
  for (const source of ['exp(1/x)', 'log(1+1/x)', 'sqrt(x^-2)', 'fps(1/x)', 'compose(1/x,x)']) assert.match(workbook([source])[0]!.error!, /Laurent/);
});

test('零除算と精度・極の上限を守り、有限の精度から零とは断定しない', () => {
  for (const source of ['1/0', '1/fps(0)', '1/(x-x)', 'inv(x-x)']) assert.ok(workbook([source])[0]!.error, source);
  series('x^100/x^100', 0, ['1'], { terms: 1 });
  const pole = result('x^-128', { terms: 1 });
  assert.equal(pole.startDegree, -128);
  assert.equal(pole.coefficients!.length, 129);
  assert.match(workbook(['x^-129'])[0]!.error!, /-128/);
  assert.match(workbook(['1/x^512'])[0]!.error!, /精度|位数/);
});

test('Laurentの低レベル演算は未知の高次係数をゼロ扱いしない', () => {
  const f = rationalField;
  const pole = new LaurentSeries(f, [f.one, f.zero, f.zero], -1);
  const regular = new LaurentSeries(f, [f.one, f.one]);
  assert.equal(pole.precision, 2);
  assert.throws(() => pole.mul(regular, 2), /精度/);
  assert.throws(() => pole.at(2), /未知/);
  assert.throws(() => pole.truncate(3), /精度/);
  assert.throws(() => pole.asPowerSeries(), /Laurent/);
});

test('Laurent級数のTeXは負の指数と正しいO項を表示する', () => {
  const row = result('1/(x*(1-x))', { terms: 2 });
  assert.equal(row.resultTex, 'x^{-1}+1+x+O\\left(x^{2}\\right)');
  assert.equal(seriesTex(['-1', '2', '0'], 'ogf', -2), '-x^{-2}+2x^{-1}+O\\left(x^{1}\\right)');
  assert.doesNotThrow(() => renderToString(row.resultTex!, { throwOnError: true }));
});
