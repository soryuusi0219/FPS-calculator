import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToString } from 'katex';
import { calculate } from '../src/workbook.ts';
import type { Calculation, InputRow } from '../src/model/calculation.ts';
import { completions } from '../src/language/editor-analysis.ts';
import { renameVariable } from '../src/app/rename-variable.ts';

function run(sources: (string | Partial<InputRow>)[], options: Partial<Calculation> = {}) {
  const result=calculate({rows:sources.map((source,i)=>typeof source==='string'?{id:String(i),source}:{id:String(i),source:'',...source}),terms:8,domain:'rational',modulus:'17',basis:'ogf',...options});
  assert.equal(result.error,undefined);return result;
}
function values(sources: (string | Partial<InputRow>)[], options: Partial<Calculation> = {}) {
  const result=run(sources,options);
  for(const row of result.rows)assert.equal(row.error,undefined,row.error??row.tex??row.id);
  for(const group of result.systems??[])assert.equal(group.error,undefined,group.error??group.id);
  return result;
}
const zeros=(n=8)=>Array<string>(n).fill('0');

test('有限総和・総積は両端を含み、スカラーの厳密値と空範囲の単位元を保つ',()=>{
  const result=values(['sum(1,5,k=>k)','prod(1,5,k=>k)','sum(4,3,k=>1/0)','prod(4,3,k=>1/0)','sum(-2,2,k=>k^2)','prod(1,3,k=>1/k)','sum(1,4,k=>sum(1,k,j=>j))']);
  assert.deepEqual(result.rows.map(row=>[row.valueType,row.value]),[['scalar','15'],['scalar','120'],['scalar','0'],['scalar','1'],['scalar','10'],['scalar','1/6'],['scalar','20']]);
  const modular=values(['fps(n=>sum(0,n,k=>k),0,5)','fps(n=>prod(1,n,k=>k),0,5)'],{domain:'prime',modulus:'2'});
  assert.deepEqual(modular.rows[0]!.coefficients,['0','1','1','0','0','1','0','0']);
  assert.deepEqual(modular.rows[1]!.coefficients,['1','1','0','0','0','0','0','0']);
});

test('有限演算のFPS型・Laurent精度・レキシカル束縛と末尾精度を保つ',()=>{
  const result=values(['sum(0,7,k=>X^k)-1/(1-X)','prod(1,3,k=>1-X^k)-(1-X-X^2+X^4+X^5-X^6)','prod(1,3,k=>X^-1)*exp(X)-exp(X)/X^3','sum(1,2,k=>fps(k))-fps(3)','term=k=>X^k','sum(0,7,term)-1/(1-X)','diff(sum(0,8,k=>X^k))-diff(1/(1-X))']);
  for(const i of [0,1,2,3,5,6])assert.deepEqual(result.rows[i]!.coefficients,zeros());
  assert.equal(result.rows[2]!.startDegree,0);
  const precision=values(['prod(1,2,k=>X^-2)*X^4*exp(X)-exp(X)'],{terms:1});assert.deepEqual(precision.rows[0]!.coefficients,['0']);
});

test('無限和・無限積は次数の下界から有限化し、分割数や疎な級数を生成する',()=>{
  const result=values(['sum(1,k=>X^k)-X/(1-X)','prod(1,k=>1/(1-X^k))','sum(1,k=>X^(k^2))','sum(1,k=>X^(2*k+1))-X^3/(1-X^2)','sum(1,k=>X^k/k)+log(1-X)','sum(1,k=>(1+X^k)-1)-X/(1-X)','sum(1,k=>0)','prod(1,k=>1)','prod(1,k=>1-X^k)*prod(1,k=>1/(1-X^k))-1']);
  for(const i of [0,3,4,5,6,8])assert.deepEqual(result.rows[i]!.coefficients,zeros());
  assert.deepEqual(result.rows[1]!.coefficients,['1','1','2','3','5','7','11','15']);
  assert.deepEqual(result.rows[2]!.coefficients,['0','1','0','0','1','0','0','0']);
  assert.deepEqual(result.rows[7]!.coefficients,['1','0','0','0','0','0','0','0']);
  const minimal=values(['sum(1,k=>X^k)','prod(1,k=>1-X^k)'],{terms:1});assert.deepEqual(minimal.rows.map(row=>row.coefficients),[['0'],['1']]);
  const mod2=values(['prod(1,k=>1/(1-X^k))'],{domain:'prime',modulus:'2'});assert.deepEqual(mod2.rows[0]!.coefficients,['1','1','0','1','1','1','1','1']);
});

test('無限演算の収束を有限個の0から仮定せず、未対応な尾・型・上限を診断する',()=>{
  for(const source of ['sum(1,k=>1)','sum(1,k=>X)','prod(1,k=>1+X)','sum(1,k=>k<100?0:1)','prod(1,k=>k<100?1:2)','sum(1,k=>X^-k)','sum(1,k=>X^(10-k))','sum(1,5000,k=>k)','sum(1,5,(a,k)=>a)','prod(1,5,k=>true)','sum(1/2,2,k=>k)','sum(-1,k=>X^k)'])assert.ok(run([source]).rows[0]!.error,source);
  for(const terms of [1,8])for(const exponent of ['k-k^2+2*k','k^2-k^3+2*k','(-1)*k^2+3*k'])assert.ok(run([`sum(1,k=>X^(${exponent}))`],{terms}).rows[0]!.error,exponent);
  assert.ok(run(['sum(1,k=>X^(10000*(10000*(10000*(10000*(k-1))))+3))'],{terms:4}).rows[0]!.error);
  assert.deepEqual(values(['sum(1,k=>X^(10000*(10000*(k-1))+3))'],{terms:4}).rows[0]!.coefficients,['0','0','0','1']);
});

test('次数範囲を指定したfpsは範囲外を0とし、未使用のラムダを実行しない',()=>{
  const result=values(['fps(n=>1/n,1,3)','fps(n=>n!,3,2)','fps(n=>1/n,1)+log(1-X)','coef=n=>1/n','fps(coef,1,3)','diff(fps(n=>n,2,10))','fps(n=>(m=>m+n)(1),2,3)']);
  assert.deepEqual(result.rows[0]!.coefficients,['0','1','1/2','1/3','0','0','0','0']);
  assert.deepEqual(result.rows[1]!.coefficients,zeros());assert.deepEqual(result.rows[2]!.coefficients,zeros());
  assert.deepEqual(result.rows[4]!.coefficients,result.rows[0]!.coefficients);
  assert.deepEqual(result.rows[5]!.coefficients,['0','4','9','16','25','36','49','64']);
  assert.deepEqual(result.rows[6]!.coefficients,['0','0','3','4','0','0','0','0']);
  for(const source of ['fps(n=>n,-1)','fps(n=>n,1/2)','fps(1,0,3)','fps(n=>n,0,10001)'])assert.ok(run([source]).rows[0]!.error,source);
});

test('Euler変換は分割数・既知の積・形式的恒等式と一致し、定義域と標数を検証する',()=>{
  const result=values(['eulerTransform(X/(1-X))-prod(1,k=>1/(1-X^k))','eulerTransform(2X)-1/(1-X)^2','eulerTransform(X^2)-1/(1-X^2)','log(eulerTransform(X+X^2))-sum(1,k=>(X^k+X^(2*k))/k)','diff(eulerTransform(X/(1-X)))-diff(prod(1,k=>1/(1-X^k)))']);
  result.rows.forEach(row=>assert.deepEqual(row.coefficients,zeros()));
  for(const source of ['eulerTransform(1+X)','eulerTransform(1/X)','eulerTransform(2)'])assert.ok(run([source]).rows[0]!.error,source);
  assert.deepEqual(values(['eulerTransform(fps(0))'],{terms:1}).rows[0]!.coefficients,['1']);
  const mod=values(['eulerTransform(X/(1-X))-prod(1,k=>1/(1-X^k))'],{domain:'prime',modulus:'17'});assert.deepEqual(mod.rows[0]!.coefficients,zeros());
  assert.ok(run(['eulerTransform(X)'],{domain:'prime',modulus:'2',terms:3}).rows[0]!.error);
});

test('積で次数が下がる微分の再帰を初期値なしで解き、追加精度と小さいmodも保つ',()=>{
  const result=values(['f=1+diff(X*X*f)','f-fps(n=>(n+1)!)','diff(f)-diff(fps(n=>(n+1)!))','f/X-fps(n=>(n+1)!)/X','g=1+diff(g*X^2)','f-g']);
  assert.deepEqual(result.rows[0]!.coefficients,['1','2','6','24','120','720','5040','40320']);
  for(const i of [1,2,3,5])assert.deepEqual(result.rows[i]!.coefficients,zeros());
  assert.equal(result.rows[0]!.solver?.method,'causal-coefficient');
  const mod=values(['f=1+diff(X^2*f)','f-fps(n=>(n+1)!)'],{domain:'prime',modulus:'2'});assert.deepEqual(mod.rows[1]!.coefficients,zeros());
  assert.deepEqual(values(['f=1+diff(X^2*f)'],{terms:1}).rows[0]!.coefficients,['1']);
});

test('合成・無限和・Euler変換・ラムダ・mapを含む循環を次数順に解く',()=>{
  const result=values(['f=1+X*f(X^2)','f-1-X*compose(f,X^2)','g=1+X*sum(1,k=>X^k*g(X^k))','g-1-X*sum(1,k=>X^k*g(X^k))','t=X*eulerTransform(t)','t-X*eulerTransform(t)','h=fps(n=>n==0?1:n*h[n-1])','h-fps(n=>n!)','b=1+X*map(b,a^2)','b-1/(1-X)']);
  assert.deepEqual(result.rows[0]!.coefficients,['1','1','0','1','0','0','0','1']);
  assert.deepEqual(result.rows[2]!.coefficients,['1','0','1','1','2','2','3','4']);
  assert.deepEqual(result.rows[4]!.coefficients,['0','1','1','2','4','9','20','48']);
  for(const i of [1,3,5,7,9])assert.deepEqual(result.rows[i]!.coefficients,zeros());
  const difference=values(['f=1+X*sum(1,k=>f(X^k)-f[0])']);assert.deepEqual(difference.rows[0]!.coefficients,['1','0','0','0','0','0','0','0']);
});

test('相互参照・明示的な定義形連立・初期係数を伴う合成にも対応する',()=>{
  const source=['f=1+X*g(X^2)','g=f+X','f-1-X*g(X^2)','g-f-X'];
  const a=values(source),b=values([...source].reverse());
  assert.deepEqual(a.rows[0]!.coefficients,b.rows[3]!.coefficients);for(const i of [2,3])assert.deepEqual(a.rows[i]!.coefficients,zeros());
  const explicit=values(['u-1-X*v(X^2)','v-u-X'],{systems:[{id:'s',variables:'u\nv',equations:'u=1+X*v(X^2)\nv=u+X',method:'auto'}]});explicit.rows.forEach(row=>assert.deepEqual(row.coefficients,zeros()));
  const seeded=values([{source:'f=f(X^2)',initial:'3'}]);assert.deepEqual(seeded.rows[0]!.coefficients,['3','0','0','0','0','0','0','0']);
  assert.match(run([{source:'f=1+X*f(X^2)',initial:'2'}]).rows[0]!.error!,/不一致/);
});

test('非収束・同次数への循環・未来参照を拒否し、延長失敗後も確定済みprefixを使える',()=>{
  assert.match(run(['f=1+X*sum(1,k=>f(X^k))']).rows[0]!.error!,/収束/);
  for(const source of ['f=map(f,a^2)','f=fps(n=>f[n])','f=fps(n=>f[n+1])','f=compose(f,X^2)'])assert.ok(run([source]).rows[0]!.error,source);
  const result=run(['t=X*eulerTransform(t)','diff(diff(t))','t'],{terms:2,domain:'prime',modulus:'2'});
  assert.deepEqual(result.rows[0]!.coefficients,['0','1']);assert.ok(result.rows[1]!.error);assert.deepEqual(result.rows[2]!.coefficients,['0','1']);
});

test('総和・総積と次数範囲のTeX、補助関数・束縛と表示基底を維持する',()=>{
  const result=values(['sum(1,4,k=>X^k)','prod(1,k=>1-X^k)','fps(n=>1/n,1,4)']);
  result.rows.forEach(row=>assert.doesNotThrow(()=>renderToString(row.tex!,{throwOnError:true,trust:false})));
  assert.match(result.rows[0]!.tex!,/\\sum_/);assert.match(result.rows[1]!.tex!,/\\prod_/);assert.match(result.rows[2]!.tex!,/n=1.*\^\{4\}/);
  const egf=values(['sum(1,3,k=>X^k)'],{basis:'egf'});assert.deepEqual(egf.rows[0]!.coefficients,['0','1','2','6','0','0','0','0']);
  for(const name of ['sum','prod','eulerTransform'])assert.ok(completions(name.slice(0,-1),name.length-1,[]).items.some(item=>item.name===name));
  const input:Calculation={rows:[{id:'f',source:'F=1+X'},{id:'s',source:'sum(1,3,k=>F(X^k))+fps(k=>F[k],1,3)'}],terms:8,domain:'rational',modulus:'17',basis:'ogf'};
  const renamed=renameVariable(input,'F','G');assert.equal(renamed.count,3);assert.equal(renamed.input.rows[1]!.source,'sum(1,3,k=>G(X^k))+fps(k=>G[k],1,3)');
  assert.throws(()=>renameVariable(input,'F','k'),/捕獲/);
});

test('最大表示精度でも合成・無限和・無限積を含む循環を末尾まで検証する',()=>{
  const result=values(['f=1+X*sum(1,k=>X^k*f(X^k))','f-1-X*sum(1,k=>X^k*f(X^k))','g=1+X*prod(1,k=>1+X^k*g(X^k))','g-1-X*prod(1,k=>1+X^k*g(X^k))','diff(f)-diff(1+X*sum(1,k=>X^k*f(X^k)))','h=fps(n=>n==0?1:sum(0,n-1,k=>h[k]*h[n-1-k]))','h-Catalan'],{terms:64});
  for(const i of [1,3,4,6])assert.deepEqual(result.rows[i]!.coefficients,zeros(64));
});

test('単項式の合成と次数移動、平方根を使う循環も厳密に計算する',()=>{
  for(const domain of ['rational','prime'] as const) {
    const result=values(['compose(1/(1-X),2X^3)-1/(1-2X^3)','F=1+X^2*F/X','F-1/(1-X)','G=1+X*sqrt(G(X^2))','G-1-X*sqrt(compose(G,X^2))'],{domain});
    for(const i of [0,2,4])assert.deepEqual(result.rows[i]!.coefficients,zeros());
  }
  const nested='diff('.repeat(9)+'X^10*F'+')'.repeat(9);
  assert.match(run([`F=1+${nested}`]).rows[0]!.error!,/8階/);
  const shadow=values(['sum(1,x=>X^x)-X/(1-X)','prod(1,k=>(1-X^k)^(-k))-prod(1,7,k=>(1-X^k)^(-k))']);
  shadow.rows.forEach(row=>assert.deepEqual(row.coefficients,zeros()));
});
