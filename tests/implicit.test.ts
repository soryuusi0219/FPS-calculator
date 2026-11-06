import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from '../src/workbook.ts';
import type { Calculation, EquationSystemInput, InputRow, SolverMethod } from '../src/model/calculation.ts';
import { freeSymbols, expandCalls, stronglyConnected } from '../src/language/dependencies.ts';
import { parse } from '../src/language/parser.ts';

function run(sources: (string | Partial<InputRow>)[], options: Partial<Calculation> = {}) {
  const result = calculate({ rows: sources.map((source, i) => typeof source === 'string' ? { id: String(i), source } : { id: String(i), source: '', ...source }), terms: 6, domain: 'rational', modulus: '998244353', basis: 'ogf', ...options });
  assert.equal(result.error, undefined); return result;
}
function values(sources: (string | Partial<InputRow>)[], options: Partial<Calculation> = {}) {
  const result = run(sources, options);
  for (const row of result.rows) assert.equal(row.error, undefined, row.error ?? row.tex ?? row.id);
  for (const system of result.systems ?? []) assert.equal(system.error, undefined, system.error ?? system.id);
  return result;
}
function system(equations: string, variables: string, method: SolverMethod = 'auto', id = 's'): EquationSystemInput { return { id, equations, variables, method }; }
const zeros = (n = 6) => Array(n).fill('0');

test('循環した通常定義をFPSとして解き、Catalan・LambertWと一致する', () => {
  const result = values(['f=1+x*f^2', 'f-Catalan', 'g=x*exp(g)', 'g+LambertW(-x)', 'h=1/(1-x*h)', 'h-f']);
  assert.deepEqual(result.rows[0]!.coefficients, ['1','1','2','5','14','42']);
  for (const i of [1,3,5]) assert.deepEqual(result.rows[i]!.coefficients, zeros());
  assert.equal(result.rows[0]!.solver?.method, 'fixed-point');
  assert.equal(result.rows[2]!.solver?.method, 'fixed-point');
});

test('相互依存は同時に解き、行順と外部パラメータの定義順に依存しない', () => {
  const source = ['f=c+x*g', 'g=1+x*f*g', 'c=1', 'f-c-x*g', 'g-1-x*f*g'];
  const a = values(source); const b = values([...source].reverse());
  assert.deepEqual(a.rows[0]!.coefficients, ['1','1','1','2','4','9']);
  assert.deepEqual(a.rows[1]!.coefficients, ['1','1','2','4','9','21']);
  assert.deepEqual(a.rows[0]!.coefficients, b.rows[4]!.coefficients);
  assert.deepEqual(a.rows[1]!.coefficients, b.rows[3]!.coefficients);
  assert.deepEqual(a.rows[3]!.coefficients, zeros());
  assert.deepEqual(a.rows[4]!.coefficients, zeros());
});

test('単純な固定点反復が収束しない線形系でも係数逐次法で解ける', () => {
  const result = values(['f=2*f+x', 'g=2*h+x', 'h=g/3']);
  assert.deepEqual(result.rows[0]!.coefficients, ['0','-1','0','0','0','0']);
  assert.deepEqual(result.rows[1]!.coefficients, ['0','3','0','0','0','0']);
  assert.deepEqual(result.rows[2]!.coefficients, ['0','1','0','0','0','0']);
  assert.equal(result.rows[0]!.solver?.method, 'coefficient');
});

test('定数項で枝を選べ、無指定では非線形の定数解を勝手に選ばない', () => {
  assert.match(run(['f=f^2+x']).rows[0]!.error!, /定数項/);
  const result = values([{ source:'f=f^2+x', initial:'0' }, { source:'g=g^2+x', initial:'1' }, 'f+g-1']);
  assert.deepEqual(result.rows[0]!.coefficients, ['0','1','1','2','5','14']);
  assert.deepEqual(result.rows[1]!.coefficients, ['1','-1','-1','-2','-5','-14']);
  assert.deepEqual(result.rows[2]!.coefficients, zeros());
  assert.match(run([{source:'f=f^2+x',initial:'2'}]).rows[0]!.error!, /定数項.*満たしません/);
});

test('一般の方程式は両辺を入力でき、正負の枝と結果の通常参照に対応する', () => {
  for (const [initial, expression] of [['1','sqrt(1+x)'],['-1','-sqrt(1+x)']] as const) {
    const result = values(['u', `u-(${expression})`], { systems:[system('u^2 = 1+x', `u=${initial}`)] });
    assert.deepEqual(result.rows[1]!.coefficients, zeros());
    assert.deepEqual(result.systems![0]!.solutions[0]!.coefficients, result.rows[0]!.coefficients);
  }
});

test('非線形連立系を両解法で解き、独立した閉形式と代入残差を確認する', () => {
  for (const method of ['coefficient','newton','auto'] as const) {
    const result = values(['u-(-1+sqrt(9+4*x))/2', 'u^2+v-(1+x)', 'u-v-1'], {terms:17,systems:[system('u^2+v=1+x\nu-v=1','u=1\nv=0',method)]});
    for(const row of result.rows) assert.deepEqual(row.coefficients, zeros(17));
    assert.equal(result.systems![0]!.solutions[0]!.solver?.method, method === 'auto' ? 'newton' : method);
  }
});

test('Newton法と係数逐次法は多様な正則多項式系で同じ解を返す', () => {
  for (let k=1;k<=5;k++) {
    const equations=`u^2+${k}*v=1+x\nu-v=1`;
    const a=values(['u','v'],{terms:18,systems:[system(equations,'u=1\nv=0','coefficient')]});
    const b=values(['u','v'],{terms:18,systems:[system(equations,'u=1\nv=0','newton')]});
    assert.deepEqual(a.rows.map(row=>row.coefficients), b.rows.map(row=>row.coefficients));
  }
});

test('微分・Laurent除算・係数抽出が必要とする追加精度を循環グループ全体へ伝播する', () => {
  const result=values([{source:'f=f^2+x',initial:'0'},'f/x-Catalan','1/f-(1/x-Catalan)','diff(f)-diff(x*Catalan)','coeff(f,20)-coeff(x*Catalan,20)'],{terms:1});
  for(const i of [1,2,3]) assert.deepEqual(result.rows[i]!.coefficients, zeros(1));
  assert.equal(result.rows[4]!.value,'0');
  const explicit=values(['diff(u)-diff(sqrt(1+x))','u[20]-sqrt(1+x)[20]'],{terms:1,systems:[system('u^2=1+x','u=1','newton')]});
  assert.deepEqual(explicit.rows[0]!.coefficients,zeros(1)); assert.equal(explicit.rows[1]!.value,'0');
});

test('多項式系は小さい標数でNを制限せず解き、Jacobianと関数の分母は体上で検証する', () => {
  for(const modulus of ['2','3','5','7']) {
    const result=values(['f=1+x*f^2','f-Catalan'],{domain:'prime',modulus,terms:20});
    assert.deepEqual(result.rows[1]!.coefficients,zeros(20));
  }
  for(const method of ['coefficient','newton'] as const) {
    const result=values(['u^2+v-(1+x)','u-v-1'],{domain:'prime',modulus:'7',terms:17,systems:[system('u^2+v=1+x\nu-v=1','u=1\nv=0',method)]});
    assert.ok(result.rows.every(row=>row.coefficients!.every(c=>c==='0')));
  }
  const singular=run(['u'],{domain:'prime',modulus:'2',systems:[system('u^2=1+x','u=1')]});
  assert.match(singular.systems![0]!.error!,/Jacobian.*特異/);
  assert.ok(run(['f=x*exp(f)'],{domain:'prime',modulus:'3'}).rows[0]!.error);
});

test('一般系でもexp/logと自動微分を使用できる', () => {
  for(const method of ['coefficient','newton'] as const) {
    const result=values(['u-log(1+x)','v-exp(x)','w-sqrt(1+x)'],{systems:[system('exp(u)=1+x\nlog(v)=x\nw=sqrt(1+x*w^0)','u=0\nv=1\nw=1',method)]});
    for(const row of result.rows) assert.deepEqual(row.coefficients,zeros());
  }
});

test('恒等式・矛盾・特異な系を区別し、失敗した循環と独立した行は計算できる', () => {
  assert.match(run(['f=f']).rows[0]!.error!, /一意/);
  assert.match(run(['f=f+1']).rows[0]!.error!, /矛盾.*解が存在しません/);
  const singular=run(['u','1+x'],{systems:[system('(u-1)^2=0','u=1')]});
  assert.match(singular.systems![0]!.error!,/Jacobian.*特異/);
  assert.doesNotMatch(singular.systems![0]!.error!,/解が存在しません/);
  assert.deepEqual(singular.rows[1]!.coefficients,['1','1','0','0','0','0']);
});

test('通常定義と複数の方程式グループをまたぐ循環も同一SCCとして解く', () => {
  const result=values(['f=1+x*u','u'],{systems:[system('u=1+x*f','u=1','newton')]});
  for(const row of result.rows) assert.deepEqual(row.coefficients,Array(6).fill('1'));
  const groups=values(['u','v'],{systems:[system('u=1+x*v','u=1','coefficient','s1'),system('v=1+x*u','v=1','coefficient','s2')]});
  for(const row of groups.rows) assert.deepEqual(row.coefficients,Array(6).fill('1'));
});

test('ラムダの局所束縛を尊重し、捕獲なしで呼出しを展開する', () => {
  const result=values(['square=t=>t^2','f=1+x*square(f)','f-Catalan','g=x*(y=>(t=>y+t))(g)(1)','g-x/(1-x)','h=fps(h=>h)']);
  assert.deepEqual(result.rows[2]!.coefficients,zeros());
  assert.deepEqual(result.rows[4]!.coefficients,zeros());
  assert.deepEqual(result.rows[5]!.coefficients,['0','1','2','3','4','5']);
  const expression=expandCalls(parse('(y=>(t=>y+t))(t)(2)').expression,new Map());
  assert.deepEqual([...freeSymbols(expression)],['t']);
  assert.deepEqual([...freeSymbols(parse('(f=>f+x)').expression)],[]);
});

test('対応していない作用素を含む循環や不正な初期値を拒否する', () => {
  for(const source of ['f=compose(f,x^2)','f=map(f,a^2)','f=fps(n=>f[n])','f=f[0]+x']) assert.match(run([{source,initial:'0'}]).rows[0]!.error!,/未対応/);
  assert.match(run([{source:'f=f^2+x',initial:'f[0]'}]).rows[0]!.error!,/定数項.*独立/);
  assert.match(run([{source:'f=f^2+x',initial:'fps(0)'}]).rows[0]!.error!,/スカラー/);
  assert.ok(run([{source:'f=1/(x*f)',initial:'1'}]).rows[0]!.error);
});

test('方程式の個数・未知数名・重複定義・上限を診断する', () => {
  for(const entry of [system('u=1','u=1\nv=0'),system('u==1','u=1'),system('u=1','x=0'),system('u=1','u=1\nu=2'),system('u=1','u=1','bad' as SolverMethod)]) {
    assert.ok(run(['1'],{systems:[entry]}).systems![0]!.error);
  }
  assert.match(run(['u=2','u'],{systems:[system('u=1+x','u=1')]}).rows[0]!.error!,/複数/);
  const variables=Array.from({length:9},(_,i)=>`z${i}=0`).join('\n');
  assert.match(run(['1'],{systems:[system(Array.from({length:9},(_,i)=>`z${i}=x`).join('\n'),variables)]}).systems![0]!.error!,/8/);
});

test('SCC解析は非循環の前方参照と複数の独立した循環を分離する', () => {
  const graph=new Map([['f',new Set(['g'])],['g',new Set(['f'])],['h',new Set(['h'])],['z',new Set(['f'])]]);
  assert.deepEqual(stronglyConnected(graph),[['f','g'],['h'],['z']]);
});

test('初期値は外部スカラー式を参照でき、独立したグループの失敗を混入させない', () => {
  const result=run(['c=2',{source:'f=f^2+x',initial:'c-1'},'u','f'],{systems:[system('u=u','u=0')]});
  assert.equal(result.rows[1]!.error,undefined);
  assert.deepEqual(result.rows[3]!.coefficients,['1','-1','-1','-2','-5','-14']);
  assert.match(result.systems![0]!.error!,/Jacobian/);
});

test('最大表示精度で複数解法の残差と追加精度を検証できる', () => {
  for(const method of ['coefficient','newton'] as const) {
    const result=values(['u^2-(1+x)','diff(u)^2-1/(4*(1+x))'],{terms:64,systems:[system('u^2=1+x','u=1',method)]});
    for(const row of result.rows) assert.deepEqual(row.coefficients,zeros(64));
  }
});

test('遅延条件の未使用枝は循環解析で実行せず、組み込み関数の引数数は検証する', () => {
  const result=values(['f=if(true,1,f)','g=true?2:g','h=if(1<2,3,(n=>n)(1,2))']);
  assert.deepEqual(result.rows.map(row=>row.value),['1','2','3']);
  assert.match(run(['f=if(true,1,f,2)']).rows[0]!.error!,/3 個/);
});
