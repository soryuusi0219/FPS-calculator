import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from '../src/workbook.ts';
import type { Calculation } from '../src/model/calculation.ts';
import type { Field } from '../src/core/field.ts';
import { rationalField as f, rational, primeField } from '../src/core/field.ts';
import { recurrenceToDifferential, pRecursive, rationalGeneratingFunction } from '../src/core/sequences.ts';
import { Series } from '../src/core/series.ts';

function run(source:string,options:Partial<Calculation>={}){const result=calculate({rows:[{id:'a',source}],terms:8,domain:'rational',modulus:'17',basis:'ogf',...options});assert.equal(result.error,undefined);return result.rows[0]!;}
function coefficients(source:string,options:Partial<Calculation>={}){const result=run(source,options);assert.equal(result.error,undefined,`${source}: ${result.error}`);return result.coefficients!;}
const zeros=(n=8)=>Array(n).fill('0');

test('seq・一般漸化式・線形漸化式からFibonacciや非線形数列を生成する',()=>{
  const expected=['0','1','1','2','3','5','8','13'];
  assert.deepEqual(coefficients('linrec(2,seq(1,1),seq(0,1))'),expected);
  assert.deepEqual(coefficients('recurrence(2,seq(0,1),(a,n)=>a[n-1]+a[n-2])'),expected);
  assert.deepEqual(coefficients('recurrence(1,seq(1),(a,n)=>n*a[n-1])'),['1','1','2','6','24','120','720','5040']);
  assert.deepEqual(coefficients('recurrence(1,seq(1),(a,n)=>n%2==0?a[n-1]+1:2*a[n-1])'),['1','2','3','6','7','14','15','30']);
  assert.deepEqual(coefficients('linrec(2,seq(1,1),seq(0,1))',{terms:1}),['0']);
  assert.deepEqual(coefficients('recurrence(1,seq(1),(a,n)=>n==2?0:a[n-1])',{domain:'prime',modulus:'2'}),['1','1','0','0','0','0','0','0']);
  assert.deepEqual(coefficients('seq(2,3)'),['2','3','0','0','0','0','0','0']);
  for(const source of ['recurrence(1,seq(1),(a,n)=>a+1)','recurrence(1,seq(1),(a,n)=>sqrt(a))','recurrence(1,seq(1),(a,n)=>a[n])','recurrence(1,seq(1),(a,n)=>a[-1])','linrec(3,seq(1,1),seq(0,1))','recurrence(1,seq(1),n=>n)','seq()','seq(x)'])assert.ok(run(source).error,source);
});

test('線形漸化式から復元した有理式を通常の評価器で再評価できる',()=>{
  const report=run('rationalGF(2,seq(1,1),seq(0,1))');assert.equal(report.valueType,'analysis');assert.ok(report.analysis?.expression);
  assert.deepEqual(coefficients(`(${report.analysis!.expression})-linrec(2,seq(1,1),seq(0,1))`),zeros());
  const c=[rational(2n),rational(-1n)],init=[rational(1n),rational(3n)];
  assert.deepEqual(rationalGeneratingFunction(f,c,init).numerator.map(f.format),['1','1']);
  assert.deepEqual(coefficients('linrec(2,seq(2,-1),seq(1,3))-((1+x)/(1-x)^2)'),zeros());
});

test('推測は未使用項で検証し、情報不足・検証不一致を区別する',()=>{
  const matched=run('guess(seq(0,1,1,2,3,5,8,13),4,3)',{terms:1});assert.match(matched.analysis!.title,/未使用項でも一致/);assert.match(matched.value!,/検証 4項/);assert.match(matched.value!,/証明/);
  assert.deepEqual(coefficients(`(${matched.analysis!.expression})-x/(1-x-x^2)`),zeros());
  const mismatch=run('guess(seq(0,1,1,2,3,99,8,13),4,3)');assert.match(mismatch.analysis!.title,/検証不一致/);assert.match(mismatch.value!,/a_5/);
  assert.match(run('guess(seq(0,0,0,0,0),4,2)').analysis!.title,/候補なし/);
  assert.ok(run('guess(seq(1,2,3),3,2)').error);assert.ok(run('guess(exp(x),4,17)').error);
  const modular=run('guess(seq(0,1,1,2,3,5,8,13),4,2)',{domain:'prime',modulus:'2'});assert.match(modular.analysis!.title,/一致/);
});

test('部分和・二項変換と逆変換・Hadamard積・偶奇項抽出は通常係数に作用する',()=>{
  assert.deepEqual(coefficients('partialSums(1/(1-x))'),['1','2','3','4','5','6','7','8']);
  assert.deepEqual(coefficients('binomialTransform(1/(1-x))'),['1','2','4','8','16','32','64','128']);
  assert.deepEqual(coefficients('inverseBinomialTransform(binomialTransform(exp(x)))-exp(x)'),zeros());
  assert.deepEqual(coefficients('hadamard(1/(1-x),exp(x))-exp(x)'),zeros());
  assert.deepEqual(coefficients('even(fps(n=>n))'),['0','2','4','6','8','10','12','14']);
  assert.deepEqual(coefficients('odd(fps(n=>n))'),['1','3','5','7','9','11','13','15']);
  assert.deepEqual(coefficients('extract(fps(n=>n),3,2)'),['2','5','8','11','14','17','20','23']);
  assert.deepEqual(coefficients('even(odd(recurrence(1,seq(1),(a,n)=>a[n-1]+1)))',{terms:64}).at(-1),'254');
  assert.deepEqual(coefficients('binomialTransform(1/(1-x))',{domain:'prime',modulus:'2'}),['1','0','0','0','0','0','0','0']);
  assert.deepEqual(coefficients('partialSums(exp(x))',{basis:'egf',terms:4}),['1','2','5','16']);
  for(const source of ['even(1/x)','hadamard(x,1/x)','extract(x,0,0)','extract(x,2,2)','extract(exp(x),16,0)'])assert.ok(run(source,{terms:64}).error,source);
});

test('比較は有限精度の一致と最初の異なる負の次数も表示する',()=>{
  assert.match(run('compare(exp(x),fps(n=>1/n!))').analysis!.title,/一致/);
  assert.match(run('compare(1/x,2/x)').value!,/x\^-1/);
  assert.match(run('compare(x^7,0*x)').value!,/x\^7/);
  assert.match(run('compare(x^9,0*x)').value!,/恒等性は判定/);
});

test('p-recursive生成は多項式係数・初期値・標数を扱う',()=>{
  assert.deepEqual(coefficients('pRecursive(seq(1),-1,1+x)-exp(x)'),zeros());
  assert.deepEqual(coefficients('pRecursive(seq(1),-1-x,1)'),['1','1','2','6','24','120','720','5040']);
  assert.deepEqual(coefficients('pRecursive(seq(0,1),-1,-1,1)-x/(1-x-x^2)'),zeros());
  assert.deepEqual(coefficients('pRecursive(seq(1),-1-x,1)',{domain:'prime',modulus:'2'}),['1','1','0','0','0','0','0','0']);
  for(const source of ['pRecursive(seq(1),-1,x)','pRecursive(seq(1),-1,1+x)','pRecursive(seq(1),exp(x),1)','pRecursive(seq(1),-x^9,1)','pRecursive(seq(1),1,1,1)'])assert.ok(run(source,{domain:'prime',modulus:'2'}).error,source);
});

test('p-recursiveから復元した微分作用素は初期境界項込みで厳密に残差が0',()=>{
  function verify<T>(field: Field<T>): void {
    for(const input of [[[-1n],[1n,1n]], [[-1n,-1n],[1n]], [[-1n],[-1n],[1n]], [[1n,2n,1n],[2n,1n],[1n]]]) {
      const polynomials=input.map(p=>p.map(n=>field.fromInteger(n))), initial=Array.from({length:input.length-1},(_,i)=>field.fromInteger(BigInt(i+1)));
      const {operators,boundary}=recurrenceToDifferential(field,polynomials,initial);
      const count=8,degree=operators.length-1,seq=pRecursive(field,polynomials,initial,count+degree);
      let sum=Series.constant(field,field.zero,count);
      operators.forEach((p,k)=>{
        let value=new Series(field,seq);for(let j=0;j<k;j++)value=value.derivative();value=value.truncate(count);
        const polynomial=new Series(field,Array.from({length:count},(_,n)=>p[n]??field.zero));sum=sum.add(polynomial.mul(value));
      });
      assert.deepEqual(sum.coefficients.map(field.format),Array.from({length:count},(_,i)=>field.format(boundary[i]??field.zero)));
    }
  }
  verify(f);verify(primeField(17n));
  const report=run('pRecGF(seq(1),-1-x,1)');assert.equal(report.valueType,'analysis');assert.ok(report.analysis!.expression?.includes('diff(F)'));
});
