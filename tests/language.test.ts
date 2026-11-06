import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToString } from 'katex';
import { calculate } from '../src/workbook.ts';
import type { Calculation, RowResult } from '../src/workbook.ts';
import { exactRoot, primeField } from '../src/core/field.ts';
import { parse } from '../src/language/parser.ts';
import { statementTex, seriesTex } from '../src/language/tex.ts';

function rows(sources: string[], options: Partial<Calculation> = {}): RowResult[] {
  const result = calculate({ rows: sources.map((source, i) => ({ id: String(i), source })), terms: 6, domain: 'rational', modulus: '998244353', basis: 'ogf', ...options });
  assert.equal(result.error, undefined);
  return result.rows;
}
function result(source: string, options: Partial<Calculation> = {}): RowResult {
  const row = rows([source], options)[0]!;
  assert.equal(row.error, undefined, source);
  return row;
}
function coefficients(source: string, options: Partial<Calculation> = {}): string[] {
  const row = result(source, options);
  assert.equal(row.valueType, 'fps');
  return row.coefficients!;
}
function scalar(source: string, expected: string, options: Partial<Calculation> = {}): void {
  const row = result(source, options);
  assert.equal(row.valueType, 'scalar');
  assert.equal(row.coefficients, undefined);
  assert.equal(row.value, expected, source);
}

test('スカラーと定数FPSを区別し、混合四則演算では定数FPSへ昇格する', () => {
  scalar('2+3', '5');
  scalar('inv(2)', '1/2');
  assert.deepEqual(coefficients('fps(5)'), ['5', '0', '0', '0', '0', '0']);
  assert.deepEqual(coefficients('2+fps(3)'), ['5', '0', '0', '0', '0', '0']);
  assert.deepEqual(coefficients('2*x+3'), ['3', '2', '0', '0', '0', '0']);
  for (const source of ['nCk(x,1)', 'factorial(x)', 'fps(n=>x)', 'map(2,a^2)', '5[0]']) assert.ok(rows([source])[0]!.error, source);
});

test('平方根の既知展開・非単位の定数項・有理数スカラーの平方根', () => {
  assert.deepEqual(coefficients('sqrt(1+x)'), ['1', '1/2', '-1/8', '1/16', '-5/128', '7/256']);
  assert.deepEqual(coefficients('sqrt(4+4*x)'), ['2', '1', '-1/4', '1/8', '-5/64', '7/128']);
  scalar('sqrt(4/9)', '2/3');
  scalar('(4/9)^(1/2)', '2/3');
  scalar('8^(1/3)', '2');
  scalar('(-8)^(1/3)', '-2');
  for (const source of ['sqrt(2)', 'sqrt(-1)', 'sqrt(x)', 'sqrt(x^3)']) assert.ok(rows([source])[0]!.error, source);
});

test('定数項0の平方根は位数に応じて入力精度を増やし、最高次を失わない', () => {
  assert.deepEqual(coefficients('sqrt(x^2+x^6)'), ['0', '1', '0', '0', '0', '1/2']);
  assert.deepEqual(coefficients('sqrt(x^6)', { terms: 4 }), ['0', '0', '0', '1']);
  assert.deepEqual(coefficients('sqrt(x^2/(1-x))'), ['0', '1', '1/2', '3/8', '5/16', '35/128']);
  assert.deepEqual(coefficients('sqrt(fps(0))'), Array(6).fill('0'));
  assert.deepEqual(coefficients('sqrt(x^2)', { terms: 1 }), ['0']);
  const computed = rows(['f=x^2+x^6', 'sqrt(f)']);
  assert.equal(computed[1]!.coefficients![5], '1/2');
});

test('有理数乗・式で指定する整数乗・FPS乗の形式的恒等式', () => {
  for (const domain of ['rational', 'prime'] as const) {
    for (const source of [
      'sqrt(1+x)^2-(1+x)',
      '((1+x)^(1/3))^3-(1+x)',
      '(1+x)^x-exp(x*log(1+x))',
      '(1+x)^(1+x)-exp((1+x)*log(1+x))',
      '(1+x)^(-1/2)*sqrt(1+x)-1',
      'x^(1+2)-x^3',
      '(1+x)^(2/3)*(1+x)^(1/3)-(1+x)',
    ]) assert.deepEqual(coefficients(source, { domain }), Array(6).fill('0'), `${domain}: ${source}`);
  }
  assert.ok(rows(['(2+x)^x'])[0]!.error);
});

test('整数根は巨大な完全べきでも厳密に判定する', () => {
  assert.equal(exactRoot((1234567890123456789n ** 20n), 20), 1234567890123456789n);
  assert.equal(exactRoot(10000000000000000000000000001n, 2), null);
  assert.equal(exactRoot(-125n, 3), -5n);
  assert.equal(exactRoot(0n, 7), 0n);
});

test('有限体の平方根は二乗を検証し、非剰余を拒否する', () => {
  for (const p of [2n, 3n, 5n, 7n, 13n, 17n, 41n, 97n, 998244353n]) {
    const field = primeField(p);
    for (let a = 0n; a < (p < 20n ? p : 20n); a++) {
      const square = field.mul(a, a);
      const root = field.sqrt(square);
      assert.equal(field.mul(root, root), square);
      assert.ok(root <= p - root);
    }
  }
  assert.throws(() => primeField(7n).sqrt(3n), /存在しません/);
  assert.deepEqual(coefficients('sqrt(1+x)^2-(1+x)', { domain: 'prime', modulus: '3' }), Array(6).fill('0'));
  assert.match(rows(['sqrt(1+x)'], { domain: 'prime', modulus: '2' })[0]!.error!, /標数2/);
});

test('階乗・二項係数・順列・重複組合せの境界と構文', () => {
  for (const [source, expected] of [
    ['0!', '1'], ['5!', '120'], ['factorial(6)', '720'], ['5 nCk 2', '10'], ['nCk(5,2)', '10'],
    ['binom(5,2)', '10'], ['5 nPk 2', '20'], ['nPk(5,2)', '20'], ['3 nHk 2', '6'],
    ['nHk(3,2)', '6'], ['nHk(0,0)', '1'], ['nHk(0,1)', '0'],
    ['nCk(2,3)', '0'], ['nPk(2,3)', '0'], ['nCk(2,-1)', '0'], ['2*5 nCk 2', '20'], ['C2 = 7', '7'],
  ]) scalar(source!, expected!);
  for (const source of ['(-1)!', '(1/2)!', '2001!', 'nCk(-1,2)', 'nHk(2000,2)']) assert.ok(rows([source])[0]!.error, source);
});

test('C・P・Hは通常の名前として定義でき、組合せの予約語はnCk・nPk・nHk', () => {
  const computed = rows(['C=1+x', 'P=2', 'H=n=>n+1', '2C+P*H(3)', 'C2=7', '2C2']);
  assert.ok(computed.every((row) => !row.error));
  assert.deepEqual(computed[3]!.coefficients, ['10', '2', '0', '0', '0', '0']);
  assert.equal(computed[5]!.value, '14');
  scalar('(C=>2C)(3)', '6');
  for (const source of ['nCk=1', 'nPk=1', 'nHk=1', 'C(5,2)', 'P(5,2)', 'H(3,2)', '5C2', '5P2', '3H2']) {
    assert.ok(rows([source])[0]!.error, source);
  }
});

test('乗算の省略は識別子を分割せず、べき乗・除算・ラムダ呼出しと共存する', () => {
  for (const [implicit, explicit] of [
    ['2X+3X^2', '2*x+3*x^2'], ['-2X^2', '-2*x^2'], ['2^3X', '(2^3)*x'],
    ['1/2X', '(1/2)*x'], ['2(x+1)', '2*(x+1)'], ['(1+x)(1-x)', '(1+x)*(1-x)'],
    ['2exp(x)', '2*exp(x)'], ['2x^-1', '2*x^-1'], ['(x+1) X', '(x+1)*x'],
  ] as const) {
    const [a,b] = rows([implicit, explicit]);
    assert.equal(a!.error, undefined, implicit);
    assert.deepEqual(a!.coefficients, b!.coefficients, implicit);
    assert.equal(a!.startDegree, b!.startDegree, implicit);
  }
  const computed = rows(['F=1+x', 'FG=3', 'G=n=>n+1', '2F', '2FG', '2G(4)']);
  assert.ok(computed.every((row) => !row.error));
  assert.deepEqual(computed[3]!.coefficients, ['2', '2', '0', '0', '0', '0']);
  assert.equal(computed[4]!.value, '6');
  assert.equal(computed[5]!.value, '10');
  scalar('2nCk(5,2)', '20');
  scalar('2nPk(5,2)', '40');
  scalar('2nHk(3,2)', '12');
  scalar('2(3+4)', '14');
  scalar('2(n=>n+1)(3)', '8');
  scalar('2exp(x)[3]', '1/3');
  assert.deepEqual(coefficients('fps(n=>2n)'), ['0', '2', '4', '6', '8', '10']);
  for (const source of ['2 3', '2**X', '2.5X', 'F=2;2F']) assert.ok(rows([source])[0]!.error, source);
});

test('Catalanはカタラン数の母関数であり、合成・微分・小さいmodにも対応する', () => {
  assert.deepEqual(coefficients('Catalan'), ['1', '1', '2', '5', '14', '42']);
  assert.deepEqual(coefficients('Catalan(x)'), coefficients('Catalan'));
  assert.deepEqual(coefficients('Catalan(x^2)'), ['1', '0', '1', '0', '2', '0']);
  assert.deepEqual(coefficients('diff(Catalan)'), ['1', '4', '15', '56', '210', '792']);
  assert.deepEqual(coefficients('Catalan', { terms: 1 }), ['1']);
  scalar('Catalan[10]', '16796', { terms: 1 });
  scalar('Catalan(0)', '1');
  assert.deepEqual(coefficients('Catalan(fps(0))'), ['1', '0', '0', '0', '0', '0']);
  assert.deepEqual(coefficients('Catalan-1-x Catalan^2'), Array(6).fill('0'));
  assert.deepEqual(coefficients('Catalan-(1-sqrt(1-4x))/(2x)'), Array(6).fill('0'));
  for (const modulus of ['2', '3', '5']) {
    const options = { domain: 'prime' as const, modulus };
    assert.deepEqual(coefficients('Catalan-1-x Catalan^2', options), Array(6).fill('0'));
    assert.deepEqual(coefficients('Catalan', options), ['1', '1', '2', '5', '14', '42'].map((n) => String(BigInt(n) % BigInt(modulus))));
  }
});

test('LambertWはW exp(W)=fを満たし、位数・必要精度・係数の分母を検証する', () => {
  assert.deepEqual(coefficients('LambertW(x)'), ['0', '1', '-1', '3/2', '-8/3', '125/24']);
  assert.deepEqual(coefficients('LambertW(x^2)'), ['0', '0', '1', '0', '-1', '0']);
  assert.deepEqual(coefficients('LambertW(x)/x'), ['1', '-1', '3/2', '-8/3', '125/24', '-54/5']);
  assert.deepEqual(coefficients('diff(LambertW(x))'), ['1', '-2', '9/2', '-32/3', '625/24', '-324/5']);
  scalar('LambertW(0)', '0');
  assert.deepEqual(coefficients('LambertW(fps(0))'), Array(6).fill('0'));
  assert.deepEqual(coefficients('LambertW(x)', { terms: 1 }), ['0']);
  for (const domain of ['rational', 'prime'] as const) {
    for (const source of ['LambertW(x)*exp(LambertW(x))-x', 'LambertW(x*exp(x))-x', 'LambertW(x+x^2)*exp(LambertW(x+x^2))-(x+x^2)']) {
      assert.deepEqual(coefficients(source, { domain }), Array(6).fill('0'), source);
    }
  }
  assert.deepEqual(coefficients('LambertW(x)', { domain: 'prime', modulus: '2', terms: 3 }), ['0', '1', '1']);
  assert.deepEqual(coefficients('LambertW(x^2)', { domain: 'prime', modulus: '3' }), ['0', '0', '1', '0', '2', '0']);
  assert.deepEqual(coefficients('LambertW(x^10)', { domain: 'prime', modulus: '2' }), Array(6).fill('0'));
  assert.ok(rows(['LambertW(x)'], { domain: 'prime', modulus: '2', terms: 4 })[0]!.error);
  for (const source of ['Catalan=2', 'LambertW=2', 'Catalan(1+x)', 'LambertW(1+x)', 'Catalan(1/x)', 'LambertW(1/x)', 'LambertW(1)', 'Catalan(1)', 'LambertW()', 'Catalan()']) {
    assert.ok(rows([source])[0]!.error, source);
  }
});

test('符号なし第1種・第2種スターリング数を整数漸化式で計算する', () => {
  for (const [source, expected] of [
    ['stirling1(4,2)', '11'], ['s1(5,2)', '50'], ['stirling2(4,2)', '7'], ['s2(5,2)', '15'],
    ['s1(0,0)', '1'], ['s2(0,0)', '1'], ['s1(5,0)', '0'], ['s2(3,4)', '0'],
  ]) scalar(source!, expected!);
  assert.ok(rows(['s1(257,2)'])[0]!.error);
});

test('小さい標数でも組合せの整数引数と次数をmodで変えない', () => {
  const options = { domain: 'prime' as const, modulus: '5' };
  scalar('nCk(10,5)', '2', options);
  scalar('5!', '0', options);
  scalar('s2(5,2)', '0', options);
  assert.deepEqual(coefficients('fps(n=>n!)', options), ['1', '1', '2', '1', '4', '0']);
  assert.deepEqual(coefficients('fps(n=>n==0 ? 1 : 0)', { domain: 'prime', modulus: '2' }), ['1', '0', '0', '0', '0', '0']);
  assert.deepEqual(coefficients('fps(n=>n%2==0 ? 1 : 0)', { domain: 'prime', modulus: '2' }), ['1', '0', '1', '0', '1', '0']);
  assert.deepEqual(coefficients('x^3', { domain: 'prime', modulus: '2' }), ['0', '0', '0', '1', '0', '0']);
});

test('ラムダによるFPS生成・名前付きラムダ・レキシカルな束縛', () => {
  assert.deepEqual(coefficients('fps(n=>1/n!)'), coefficients('exp(x)'));
  assert.deepEqual(coefficients('fps(n=>nCk(2*n,n))'), ['1', '2', '6', '20', '70', '252']);
  const computed = rows(['f=fps(c)', 'c=n=>n+1', 'f[4]', '(n=>(k=>n+k))(2)(3)']);
  assert.equal(computed[1]!.valueType, 'lambda');
  assert.equal(computed[2]!.value, '5');
  assert.equal(computed[3]!.value, '5');
  assert.deepEqual(computed[0]!.coefficients, ['1', '2', '3', '4', '5', '6']);
  assert.deepEqual(coefficients('fps(n=>map(fps(1),(a,i)=>n)[0])'), ['0', '1', '2', '3', '4', '5']);
  assert.ok(rows(['fps((a,n)=>a+n)'])[0]!.error);
  assert.ok(rows(['fps(()=>1)'])[0]!.error);
  assert.ok(rows(['fps((n,n)=>n)'])[0]!.error);
});

test('係数抽出は表示精度とは独立し、スカラーを返す', () => {
  scalar('(1/(1-x)^2)[10]', '11', { terms: 1 });
  scalar('coeff(1/(1-x)^2,10)', '11', { terms: 1, basis: 'egf' });
  scalar('(1/(1-x))[-1]', '0');
  const computed = rows(['f=exp(x)', 'k=5', 'f[k]']);
  assert.equal(computed[2]!.value, '1/120');
  scalar('coeff(diff(exp(x)), 5)', '1/120', { terms: 1 });
  for (const source of ['x[1/2]', 'x[128]', 'x[x]']) assert.ok(rows([source])[0]!.error);
});

test('mapで階乗・隣接係数・ラムダを組み合わせ、末尾の参照精度も保つ', () => {
  assert.deepEqual(coefficients('map(1/(1-x),(a,i)=>(i+1)!*a^2)'), ['1', '2', '6', '24', '120', '720']);
  assert.deepEqual(coefficients('map(1/(1-x)^2,i*a[i+1]^2)'), ['0', '9', '32', '75', '144', '245']);
  assert.deepEqual(coefficients('map(1/(1-x)^2,(a,i)=>i*a[i+1]^2)'), ['0', '9', '32', '75', '144', '245']);
  assert.deepEqual(coefficients('map(1/(1-x)^2,a[n-1])'), ['0', '1', '2', '3', '4', '5']);
  assert.deepEqual(coefficients('diff(map(1/(1-x)^2,(a,i)=>i*a[i+1]^2))'), ['9', '64', '225', '576', '1225', '2304']);
  const computed = rows(['f=1/(1-x)^2', 'm=i=>i*f[i+1]^2', 'map(f,m)']);
  assert.deepEqual(computed[2]!.coefficients, ['0', '9', '32', '75', '144', '245']);
});

test('条件式と論理演算は遅延評価し、次数0で割る枝を回避できる', () => {
  assert.deepEqual(coefficients('fps(n=>n==0 ? 0 : 1/n)'), ['0', '1', '1/2', '1/3', '1/4', '1/5']);
  assert.deepEqual(coefficients('fps(n=>if(n<2,1,n!))'), ['1', '1', '2', '6', '24', '120']);
  scalar('if(false,1/0,3)', '3');
  scalar('true ? 7 : missing', '7');
  assert.equal(result('false && 1/0==0').value, 'false');
  assert.equal(result('true || missing==0').value, 'true');
  assert.equal(result('!(1<2)').value, 'false');
  assert.ok(rows(['1?2:3'])[0]!.error);
});

test('EGFは表示だけを変え、係数抽出・mapの入力は通常係数を使用する', () => {
  scalar('exp(x)[4]', '1/24', { basis: 'egf' });
  assert.deepEqual(coefficients('map(exp(x),(a,n)=>a^2)', { basis: 'egf' }), ['1', '1', '1/2', '1/6', '1/24', '1/120']);
  assert.equal(seriesTex(['1', '1', '1'], 'egf'), '1+x+\\frac{x^{2}}{2!}+O\\left(x^{3}\\right)');
});

test('TeXはASTと厳密な係数から生成し、KaTeXで描画可能', () => {
  for (const source of [
    'sqrt(1+x)', '(1+x)^x', 'fps(n=>n%2==0?1:0)', 'map(1/(1-x),(a,i)=>(i+1)!*a^2)',
    'nCk(5,2)', '5 nPk 2', '3 nHk 2', 'nPk(5,2)', 'nHk(3,2)', 'exp(x)[3]', 'foo_bar = 1+x', 'true && !false',
    'Catalan', 'Catalan(x+x^2)', 'LambertW(x)', '2X+3(x+1)',
  ]) {
    const row = result(source);
    assert.doesNotThrow(() => renderToString(row.tex!, { throwOnError: true, trust: false }));
    assert.doesNotThrow(() => renderToString(row.resultTex!, { throwOnError: true, trust: false }));
  }
  assert.equal(seriesTex(['0', '-1', '1/2', '0'], 'ogf'), '-x+\\frac{1}{2}x^{2}+O\\left(x^{4}\\right)');
  assert.match(statementTex(parse('v=1/2')), /\\frac\{1\}\{2\}/);
  assert.throws(() => parse('\\href{javascript:alert(1)}{x}'));
});

test('型エラー・添字の上限・再帰ラムダを明示的に拒否する', () => {
  for (const source of ['map(x,(a,n,k)=>a)', 'fps(n=>fps(n))', 'x^(n=>n)', '2^10001', '(-1)!', 'x[false]']) assert.ok(rows([source])[0]!.error, source);
  assert.match(rows(['loop=n=>loop(n)', 'loop(0)'])[1]!.error!, /入れ子/);
  assert.match(rows(['f=fps(n=>f[n])'])[0]!.error!, /循環参照/);
});

test('長い加算式のTeX変換でも係数計算と数式表示を完了する', () => {
  const row = result(`f=1${'+x'.repeat(110)}`);
  assert.deepEqual(row.coefficients, ['1', '110', '0', '0', '0', '0']);
  assert.equal(row.tex!.match(/x/g)?.length, 110);
  assert.doesNotThrow(() => renderToString(row.tex!, { throwOnError: true }));
});
