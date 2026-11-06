import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from '../src/workbook.ts';
import type { Calculation, InputRow, SolverMethod } from '../src/model/calculation.ts';
function run(rows:(string|Partial<InputRow>)[],options:Partial<Calculation>={}){const result=calculate({rows:rows.map((row,i)=>typeof row==='string'?{id:String(i),source:row}:{id:String(i),source:'',...row}),terms:8,domain:'rational',modulus:'17',basis:'ogf',...options});assert.equal(result.error,undefined);return result;}
function values(rows:(string|Partial<InputRow>)[],options:Partial<Calculation>={}){const result=run(rows,options);for(const row of result.rows)assert.equal(row.error,undefined,row.error??row.tex??row.id);for(const group of result.systems??[])assert.equal(group.error,undefined,group.error??group.id);return result;}
function system(variables:string,equations:string,method:SolverMethod='auto'){return {id:'s',variables,equations,method};}
const zeros=(n=8)=>Array(n).fill('0');

test('積分再帰は指数・非線形方程式・入れ子・初期値を次数順に解く',()=>{
  const result=values(['f=1+integral(f)','f-exp(x)','g=integral(1+g^2)','diff(g)-1-g^2','h=1+integral(integral(h))','diff(diff(h))-h','z=integral(z)']);
  for(const i of [1,3,5,6])assert.deepEqual(result.rows[i]!.coefficients,zeros());
  assert.equal(result.rows[0]!.solver!.method,'differential-coefficient');
  assert.match(run([{source:'f=1+integral(f)',initial:'2'}]).rows[0]!.error!,/矛盾|不一致/);
  assert.deepEqual(values(['f=x*integral(f)']).rows[0]!.coefficients,zeros());
  assert.deepEqual(values(['f=1+integral(2*diff(f))']).rows[0]!.coefficients,['1','0','0','0','0','0','0','0']);
  assert.match(run(['f=1+integral(diff(f))']).rows[0]!.error!,/特異/);
  assert.deepEqual(values(['f=integral(exp(f))','f+log(1-x)']).rows[1]!.coefficients,zeros());
});

test('通常行の微分再帰は初期値を必要とし、外側の追加精度にも応じる',()=>{
  const result=values([{source:'f=diff(f)',initial:'1'},'f-exp(x)','diff(f)-exp(x)','even(f)-even(exp(x))']);
  for(const i of [1,2,3])assert.deepEqual(result.rows[i]!.coefficients,zeros());
  assert.match(run(['f=diff(f)']).rows[0]!.error!,/定数項/);
  const minimal=values([{source:'f=diff(f)',initial:'1'}],{terms:1});assert.deepEqual(minimal.rows[0]!.coefficients,['1']);
});

test('明示的な1階・2階のODEと微分代数連立系を解く',()=>{
  const exponential=values(['u-exp(x)','diff(u)-u'],{systems:[system('u=1','diff(u)=u')]});
  exponential.rows.forEach(row=>assert.deepEqual(row.coefficients,zeros()));
  const harmonic=values(['diff(u)+v','diff(v)-u','u^2+v^2-1'],{systems:[system('u=1\nv=0','diff(u)=-v\ndiff(v)=u')]});
  harmonic.rows.forEach(row=>assert.deepEqual(row.coefficients,zeros()));
  const second=values(['diff(diff(u))+u','u'],{systems:[system('u=seq(0,1)','diff(diff(u))=-u')]});
  assert.deepEqual(second.rows[0]!.coefficients,zeros());assert.deepEqual(second.rows[1]!.coefficients,['0','1','0','-1/6','0','1/120','0','-1/5040']);
  const mixed=values(['u-1/(1-x)','v-1/(1-x)^2'],{systems:[system('u=1\nv','diff(u)=v\nv=u^2')]});mixed.rows.forEach(row=>assert.deepEqual(row.coefficients,zeros()));
});

test('積・商・連鎖律と微積分の相殺を式として展開する',()=>{
  for(const equation of ['diff(u^2)=2*u','diff(log(u))=1/u','diff(sqrt(u))=1/(2*sqrt(u))','diff(1/u)=-1/u^2']) {
    const result=values(['u-1-x'],{systems:[system('u=1',equation)]});assert.deepEqual(result.rows[0]!.coefficients,zeros());
  }
  const canceled=values(['f=1+x*diff(integral(f))','f-1/(1-x)']);assert.deepEqual(canceled.rows[1]!.coefficients,zeros());
  const trivial=values(['f=1+diff(f^0)']);assert.deepEqual(trivial.rows[0]!.coefficients,['1','0','0','0','0','0','0','0']);
  const unused=values(['f=if(1<2,1+x*f,diff(compose(f,x^2)))','f-1/(1-x)']);assert.deepEqual(unused.rows[1]!.coefficients,zeros());
});

test('非線形な最高階微分には追加の初期係数で枝を指定できる',()=>{
  assert.match(run(['u'],{systems:[system('u=0','diff(u)^2=1')]}).systems![0]!.error!,/非線形/);
  const branch=values(['u-x'],{systems:[system('u=seq(0,1)','diff(u)^2=1')]});assert.deepEqual(branch.rows[0]!.coefficients,zeros());
  assert.match(run(['u'],{systems:[system('u=seq(0,0)','diff(u)^2=1')]}).systems![0]!.error!,/矛盾/);
});

test('初期係数不足・特異な最高階行列・標数の障害を診断する',()=>{
  assert.match(run(['u'],{systems:[system('u=1','diff(diff(u))=u')]}).systems![0]!.error!,/初期係数/);
  assert.match(run([{source:'f=x*diff(f)',initial:'0'}]).rows[0]!.error!,/特異/);
  assert.match(run(['u'],{systems:[system('u=1','diff(u)=u')],domain:'prime',modulus:'2'}).systems![0]!.error!,/特異|矛盾/);
  for(const equations of ['diff(u)=u','diff(u)=v\nv=u']) {
    const boundary=values(['u-exp(x)'],{terms:2,domain:'prime',modulus:'2',systems:[system(equations.includes('v')?'u=1\nv':'u=1',equations)]});assert.deepEqual(boundary.rows[0]!.coefficients,['0','0']);
  }
  const good=values(['u-exp(x)'],{systems:[system('u=1','diff(u)=u','newton')],domain:'prime',modulus:'17'});assert.deepEqual(good.rows[0]!.coefficients,zeros());
  const independent=run(['u','exp(x)'],{systems:[system('u','diff(u)=u')]});assert.ok(independent.rows[0]!.error);assert.equal(independent.rows[1]!.error,undefined);
});

test('最大表示次数の末尾・多段微分・混在グループ間の依存を保つ',()=>{
  const result=values(['diff(u)-exp(x)','even(u)-even(exp(x))'],{terms:64,systems:[system('u=1','diff(u)=u')]});result.rows.forEach(row=>assert.deepEqual(row.coefficients,zeros(64)));
  const mixed=values(['f-exp(x)'],{systems:[system('u=1','diff(u)=u')],rows:[{id:'f',source:'f=1+integral(u)'},{id:'d',source:'f-exp(x)'}]});assert.deepEqual(mixed.rows[1]!.coefficients,zeros());
});


test('延長失敗は既存prefixのキャッシュを壊さない',()=>{
  const result=run(['u','diff(u)','u'],{terms:2,domain:'prime',modulus:'2',systems:[system('u=1','diff(u)=u')]});
  assert.deepEqual(result.rows[0]!.coefficients,['1','1']);assert.ok(result.rows[1]!.error);assert.deepEqual(result.rows[2]!.coefficients,['1','1']);
  assert.equal(result.systems![0]!.error,undefined);
});
