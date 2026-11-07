import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToString } from 'katex';
import { calculate } from '../src/workbook.ts';
import type { Calculation, InputRow } from '../src/model/calculation.ts';
import { Series } from '../src/core/series.ts';
import { primeField, rational, rationalField } from '../src/core/field.ts';

function run(sources:(string|Partial<InputRow>)[],options:Partial<Calculation>={}) {
  const result=calculate({rows:sources.map((source,i)=>typeof source==='string'?{id:String(i),source}:{id:String(i),source:'',...source}),terms:8,domain:'rational',modulus:'17',basis:'ogf',...options});
  assert.equal(result.error,undefined);return result;
}
function values(sources:(string|Partial<InputRow>)[],options:Partial<Calculation>={}) {
  const result=run(sources,options);
  for(const row of result.rows)assert.equal(row.error,undefined,row.error??row.tex??row.id);
  for(const group of result.systems??[])assert.equal(group.error,undefined,group.error??group.id);
  return result;
}
const zeros=(n=8)=>Array<string>(n).fill('0');

test('EGF生成は通常係数へn!を反映し、表示基底から独立する',()=>{
  const result=values(['egf(n=>1)-exp(X)','egf(n=>n!)-1/(1-X)','weights=n=>n+1','egf(weights)-exp(X)*(1+X)']);
  for(const i of [0,1,3])assert.deepEqual(result.rows[i]!.coefficients,zeros());
  assert.deepEqual(values(['egf(n=>1)'],{basis:'egf'}).rows[0]!.coefficients,Array(8).fill('1'));
  assert.deepEqual(values(['egf(n=>1)'],{terms:1}).rows[0]!.coefficients,['1']);
  assert.deepEqual(values(['egf(seq(1,2,6,24))']).rows[0]!.coefficients,['1','2','3','4','0','0','0','0']);
});

test('EGFの次数範囲・捕捉・微分の追加精度と標数の障害を検証する',()=>{
  const result=values(['egf(n=>1/n,1,3)','egf(n=>1/0,3,2)','diff(egf(n=>1))-exp(X)','(k=>egf(n=>k^n))(2)-exp(2X)','F=egf(n=>1)','F[10]-exp(X)[10]']);
  assert.deepEqual(result.rows[0]!.coefficients,['0','1','1/4','1/18','0','0','0','0']);
  for(const i of [1,2,3])assert.deepEqual(result.rows[i]!.coefficients,zeros());assert.equal(result.rows[5]!.value,'0');
  const mod=values(['egf(n=>n==0?1:0,0,1)','egf(3)'],{domain:'prime',modulus:'2'});assert.deepEqual(mod.rows[0]!.coefficients,['1','0','0','0','0','0','0','0']);assert.deepEqual(mod.rows[1]!.coefficients,['1','0','0','0','0','0','0','0']);
  assert.match(run(['egf(n=>1)'],{domain:'prime',modulus:'2',terms:3}).rows[0]!.error!,/EGF.*2!/);
  for(const source of ['egf(n=>n,-1)','egf(n=>n,1/2)','egf(1,0,2)','egf((a,n)=>a)','egf(1/X)'])assert.ok(run([source]).rows[0]!.error,source);
  const recursive=values(['F=egf(n=>n==0?1:F[n-1])']);assert.deepEqual(recursive.rows[0]!.coefficients!.slice(0,5),['1','1','1/2','1/12','1/288']);
});

test('revertを含む循環を次数順に解き、両方向の合成・追加精度を検証する',()=>{
  const result=values(['F=X+X*revert(F)','F-X-X*revert(F)','compose(F,revert(F))-X','compose(revert(F),F)-X','diff(F)-diff(X+X*revert(F))','F/X-1-revert(F)']);
  assert.deepEqual(result.rows[0]!.coefficients,['0','1','1','-1','3','-13','69','-419']);
  for(const i of [1,2,3,4,5])assert.deepEqual(result.rows[i]!.coefficients,zeros());
  assert.equal(result.rows[0]!.solver!.method,'causal-coefficient');
  assert.deepEqual(values(['F=X+X*revert(F)'],{terms:1}).rows[0]!.coefficients,['0']);
  const auxiliary='F=X+X^2+X^2*revert(diff(F)-1)';assert.deepEqual(values([auxiliary],{terms:1}).rows[0]!.coefficients,['0']);
  assert.deepEqual(values([auxiliary,'F-X-X^2-X^2*revert(diff(F)-1)']).rows[1]!.coefficients,zeros());
  const coupled=values(['F-X-X*revert(G)','G-X-X*revert(F)'],{systems:[{id:'s',variables:'F\nG',equations:'F=X+X*revert(G)\nG=X+X*revert(F)',method:'auto'}]});coupled.rows.forEach(row=>assert.deepEqual(row.coefficients,zeros()));
});

test('合成逆関数は小標数でも線形係数だけで割り、不正な枝・非因果的な参照を拒否する',()=>{
  for(const modulus of ['2','3','5']) {
    const result=values(['F=X+X*revert(F)','F-X-X*revert(F)','compose(revert(X-X^2),X-X^2)-X','compose(X-X^2,revert(X-X^2))-X'],{domain:'prime',modulus});
    for(const i of [1,2,3])assert.deepEqual(result.rows[i]!.coefficients,zeros());
  }
  for(const terms of [1,8])for(const source of ['F=1+X*revert(F)','F=X^2+X*revert(F)','F=revert(F)'])assert.ok(run([source],{terms}).rows[0]!.error,`${terms}: ${source}`);
  assert.match(run([{source:'F=X+X*revert(F)',initial:'seq(0,2)'}]).rows[0]!.error!,/不一致/);
  const seeded=run(['F'],{terms:1,systems:[{id:'s',variables:'F=seq(0,2)\nG=seq(0,2)',equations:'F=X+X*G\nG=F+X^2*revert(G)',method:'auto'}]});assert.match(seeded.systems![0]!.error!,/不一致/);
  const f=primeField(2n);assert.deepEqual(new Series(f,[0n,1n,1n,0n,0n]).revert().coefficients,[0n,1n,1n,0n,1n]);
  assert.throws(()=>new Series(rationalField,[rational(0n),rational(0n),rational(1n)]).revert(),/一次項|\[x\]/);
});

test('三角・双曲線とその逆関数は既知の厳密係数を返す',()=>{
  const sources=['sin(X)','cos(X)','tan(X)','arcsin(X)','arctan(X)','sinh(X)','cosh(X)','tanh(X)','arcsinh(X)','arctanh(X)'];
  const expected=[
    ['0','1','0','-1/6','0','1/120','0','-1/5040'],['1','0','-1/2','0','1/24','0','-1/720','0'],
    ['0','1','0','1/3','0','2/15','0','17/315'],['0','1','0','1/6','0','3/40','0','5/112'],['0','1','0','-1/3','0','1/5','0','-1/7'],
    ['0','1','0','1/6','0','1/120','0','1/5040'],['1','0','1/2','0','1/24','0','1/720','0'],
    ['0','1','0','-1/3','0','2/15','0','-17/315'],['0','1','0','-1/6','0','3/40','0','-5/112'],['0','1','0','1/3','0','1/5','0','1/7'],
  ];
  assert.deepEqual(values(sources).rows.map(row=>row.coefficients),expected);
  const scalar=values(['sin(0)','cos(0)','arcsin(0)','arccos(1)','arccosh(1)','cosh(0)','tanh(0)']);assert.deepEqual(scalar.rows.map(row=>[row.valueType,row.value]),[['scalar','0'],['scalar','1'],['scalar','0'],['scalar','0'],['scalar','0'],['scalar','1'],['scalar','0']]);
});

test('逆数型関数はLaurentの極と末尾精度を保つ',()=>{
  const result=values(['csc(X)','cot(X)','csch(X)','coth(X)','csc(X)*sin(X)-1','cot(X)*sin(X)-cos(X)','csch(X)*sinh(X)-1','coth(X)*sinh(X)-cosh(X)','sec(X)*cos(X)-1','sech(X)*cosh(X)-1']);
  assert.equal(result.rows[0]!.startDegree,-1);assert.equal(result.rows[0]!.coefficients!.at(-1),'127/604800');assert.equal(result.rows[1]!.coefficients!.at(-1),'-1/4725');
  for(let i=4;i<result.rows.length;i++)assert.deepEqual(result.rows[i]!.coefficients,zeros());
  const inverse=values(['arccot(cot(X))-X','arccsc(csc(X))-X','arccoth(coth(X))-X','arccsch(csch(X))-X','arcsec(sec(X))-X','arcsech(sech(X))-X']);inverse.rows.forEach(row=>assert.deepEqual(row.coefficients,zeros()));
});

test('逆関数の枝・超越定数・定義域を明示し、acos/acoshは定数項1の枝を計算する',()=>{
  const result=values(['cos(arccos(1-X^2/2))-(1-X^2/2)','cosh(arccosh(1+X^2/2))-(1+X^2/2)','arccos(cos(X))-X','arccosh(cosh(X))-X','arccos(1-X^4/2)','asin(X)-arcsin(X)','acosh(1+X^2/2)-arccosh(1+X^2/2)']);
  for(const i of [0,1,2,3,5,6])assert.deepEqual(result.rows[i]!.coefficients,zeros());
  assert.deepEqual(result.rows[4]!.coefficients,['0','0','1','0','0','0','1/24','0']);
  assert.match(run(['arccos(X)']).rows[0]!.error!,/π\/2/);
  for(const source of ['sin(1)','cos(1+X)','arcsin(1+X)','arccos(-1)','arccosh(X)','arccos(1-X)','sin(1/X)','arccot(X)','arcsec(X)','csc(0)'])assert.ok(run([source]).rows[0]!.error,source);
});

test('形式的恒等式・微分・小標数・精度1を保つ',()=>{
  const identities=['sin(X)^2+cos(X)^2-1','cosh(X)^2-sinh(X)^2-1','sin(arcsin(X))-X','tan(arctan(X))-X','sinh(arcsinh(X))-X','tanh(arctanh(X))-X','diff(sin(X))-cos(X)','diff(cos(X))+sin(X)','diff(tanh(X))-sech(X)^2','diff(arcsin(X))-1/sqrt(1-X^2)','diff(arctanh(X))-1/(1-X^2)'];
  for(const domain of ['rational','prime'] as const)values(identities,{domain}).rows.forEach(row=>assert.deepEqual(row.coefficients,zeros()));
  const min=values(['sin(X)','cos(X)','arctan(X)','sec(X)','csc(X)'],{terms:1,domain:'prime',modulus:'2'});assert.deepEqual(min.rows.map(row=>row.coefficients),[['0'],['1'],['0'],['1'],['1','0']]);
  const sparse=values(['sin(X^10)','cos(X^10)','cos(X^2)'],{terms:6,domain:'prime',modulus:'3'});assert.deepEqual(sparse.rows[0]!.coefficients,zeros(6));assert.deepEqual(sparse.rows[1]!.coefficients,['1','0','0','0','0','0']);assert.deepEqual(sparse.rows[2]!.coefficients,['1','0','0','0','1','0']);
  assert.ok(run(['sin(X)'],{domain:'prime',modulus:'3',terms:4}).rows[0]!.error);
  assert.deepEqual(values(['cos(fps(0))'],{domain:'prime',modulus:'2'}).rows[0]!.coefficients,['1','0','0','0','0','0','0','0']);
});

test('三角関数を含む次数依存の再帰と正則ODEを解き、TeXを描画できる',()=>{
  const result=values(['F=X+X*sin(F)','F-X-X*sin(F)','G=integral(cos(G))','diff(G)-cos(G)']);for(const i of [1,3])assert.deepEqual(result.rows[i]!.coefficients,zeros());
  const ode=values(['u-arcsin(X)'],{systems:[{id:'s',variables:'u=0',equations:'diff(sin(u))=1',method:'auto'}]});assert.deepEqual(ode.rows[0]!.coefficients,zeros());
  values(['egf(n=>1,1,4)','sin(X)','arccos(1-X^2/2)','csc(X)','arccsch(1/X)']).rows.forEach(row=>{
    assert.doesNotThrow(()=>renderToString(row.tex!,{trust:false,throwOnError:true}));assert.doesNotThrow(()=>renderToString(row.resultTex!,{trust:false,throwOnError:true}));
  });
});

test('revertの循環は64項と追加精度まで計算し、延長失敗でprefixを壊さない',()=>{
  const result=values(['F=X+X*revert(F)','F-X-X*revert(F)','diff(F)-diff(X+X*revert(F))'],{terms:64});for(const i of [1,2])assert.deepEqual(result.rows[i]!.coefficients,zeros(64));
  const failure=run(['F=X+X*revert(F)+X^3*egf(n=>1)','diff(diff(diff(diff(F))))','F'],{terms:2,domain:'prime',modulus:'2'});assert.equal(failure.rows[0]!.error,undefined);assert.ok(failure.rows[1]!.error);assert.deepEqual(failure.rows[2]!.coefficients,failure.rows[0]!.coefficients);
});
