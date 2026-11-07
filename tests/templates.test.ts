import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToString } from 'katex';
import { notebookTemplates, templateCategories, filterTemplates, previewTemplate } from '../src/app/templates.ts';
import { decodeNotebook, exportNotebook, importNotebook, notebookDocument } from '../src/app/notebook-document.ts';
import { createShareUrl, readShareHash } from '../src/app/sharing.ts';
import { NotebookModel } from '../src/app/notebook-model.ts';
import { EditHistory } from '../src/app/edit-history.ts';
import { calculate } from '../src/workbook.ts';
import type { Calculation, CalculationResult, RowResult } from '../src/model/calculation.ts';
import { templateExpectations } from './fixtures/template-expectations.ts';

function load(id:string) {const entry=notebookTemplates.find(entry=>entry.id===id);assert.ok(entry,id);let i=0;return decodeNotebook(entry.document,()=>`${id}-${i++}`);}
function run(id:string,adapt?:(input:Calculation)=>void) {
  const session=load(id);adapt?.(session.input);const result=calculate(session.input);
  assert.equal(result.error,undefined,id);
  result.rows.forEach(row=>assert.equal(row.error,undefined,`${id}: ${row.error??row.id}`));
  result.systems?.forEach(system=>assert.equal(system.error,undefined,`${id}: ${system.error??system.id}`));
  return {input:session.input,result};
}
function find(input:Calculation,result:CalculationResult,name:string):RowResult {
  const value=result.rows.find(row=>row.name===name)??result.rows[input.rows.findIndex(row=>row.source===name)];assert.ok(value,name);return value;
}
function coefficients(id:string,name:string) {const {input,result}=run(id);return find(input,result,name).coefficients!;}

test('小さいグラフの全列挙を、EGF表示のグラフ・木・森・関数グラフと照合する',()=>{
  const counts:Record<string,number[]>=Object.fromEntries(['all','connected','unicyclic','eulerian','bipartite','bridgeless','blocks','trees','rootedTrees','forests','rootedForests','directed','dag','strong','tournament','functionalConnected'].map(key=>[key,[]]));
  const connected=(a:boolean[][],removed=-1)=>{
    const vertices=a.map((_,i)=>i).filter(i=>i!==removed);if(!vertices.length)return false;
    const seen=new Set([vertices[0]!]),queue=[vertices[0]!];
    for(const v of queue)for(const w of vertices)if(a[v]![w]&&!seen.has(w)){seen.add(w);queue.push(w);}
    return seen.size===vertices.length;
  };
  const strong=(a:boolean[][])=>a.length>0&&connected(a)&&connected(a.map((_,i)=>a.map(row=>row[i]!)));
  for(let n=0;n<=4;n++) {
    for(const values of Object.values(counts))values.push(0);
    const pairs:[number,number][]=[];for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)pairs.push([i,j]);
    for(let mask=0;mask<2**pairs.length;mask++) {
      const a=Array.from({length:n},()=>Array<boolean>(n).fill(false)),edges=pairs.filter((_,i)=>(mask>>i)&1);
      for(const [i,j] of edges)a[i]![j]=a[j]![i]=true;
      const isConnected=connected(a);let components=0,roots=1,isBipartite=true;
      const colors=Array<number>(n).fill(-1);
      for(let i=0;i<n;i++)if(colors[i]===-1){components++;const queue=[i];colors[i]=0;
        for(const v of queue)for(let w=0;w<n;w++)if(a[v]![w]){if(colors[w]===-1){colors[w]=1-colors[v]!;queue.push(w);}else if(colors[w]===colors[v])isBipartite=false;}
        roots*=queue.length;
      }
      const add=(key:string,condition:boolean,weight=1)=>{if(condition)counts[key]![n]!+=weight;};
      add('all',true);add('connected',isConnected);add('bipartite',isBipartite);
      add('unicyclic',isConnected&&edges.length===n);add('eulerian',isConnected&&a.every(row=>row.filter(Boolean).length%2===0));
      add('trees',isConnected&&edges.length===n-1);add('rootedTrees',isConnected&&edges.length===n-1,n);
      add('forests',edges.length===n-components);add('rootedForests',edges.length===n-components,roots);
      add('bridgeless',isConnected&&edges.every(([i,j])=>{a[i]![j]=a[j]![i]=false;const ok=connected(a);a[i]![j]=a[j]![i]=true;return ok;}));
      add('blocks',n>=2&&isConnected&&a.every((_,i)=>connected(a,i)));
      const tournament=Array.from({length:n},()=>Array<boolean>(n).fill(false));
      pairs.forEach(([i,j],bit)=>{if((mask>>bit)&1)tournament[i]![j]=true;else tournament[j]![i]=true;});
      add('tournament',strong(tournament));
    }
    const arcs:[number,number][]=[];for(let i=0;i<n;i++)for(let j=0;j<n;j++)if(i!==j)arcs.push([i,j]);
    for(let mask=0;mask<2**arcs.length;mask++) {
      const a=Array.from({length:n},()=>Array<boolean>(n).fill(false));arcs.forEach(([i,j],bit)=>{a[i]![j]=Boolean((mask>>bit)&1);});
      counts.directed![n]!++;if(strong(a))counts.strong![n]!++;
      const degree=a.map((_,j)=>a.filter(row=>row[j]).length),queue=degree.map((d,i)=>d===0?i:-1).filter(i=>i>=0);
      for(const i of queue)for(let j=0;j<n;j++)if(a[i]![j]){degree[j]=degree[j]!-1;if(degree[j]===0)queue.push(j);}
      if(queue.length===n)counts.dag![n]!++;
    }
    for(let code=0;code<(n===0?1:n**n);code++) {
      const a=Array.from({length:n},()=>Array<boolean>(n).fill(false));let value=code;
      for(let i=0;i<n;i++){const j=value%n;value=Math.floor(value/n);a[i]![j]=a[j]![i]=true;}
      if(connected(a))counts.functionalConnected![n]!++;
    }
  }
  const mapping:[string,string,string][]=[['undirected-graphs','A','all'],['undirected-graphs','L','connected'],['unicyclic-graphs','U','unicyclic'],['eulerian-graphs','F','eulerian'],['bipartite-graphs','B','bipartite'],['bridgeless-graphs','H','bridgeless'],['biconnected-blocks','H','blocks'],['labeled-trees','U','trees'],['labeled-trees','T','rootedTrees'],['labeled-forests','F','forests'],['labeled-forests','G','rootedForests'],['directed-graphs','A','directed'],['dag','F','dag'],['strong-digraphs','F','strong'],['tournaments','F','tournament'],['functional-graphs','Connected','functionalConnected']];
  for(const [id,name,key] of mapping)assert.deepEqual(coefficients(id,name).slice(0,5),counts[key]!.map(String),`${id}: 全列挙`);
});

test('全サンプルに独立した期待値・説明・5分野の分類があり、代表行を最初に表示する',()=>{
  assert.equal(notebookTemplates.length,52);assert.equal(new Set(notebookTemplates.map(entry=>entry.id)).size,52);
  assert.deepEqual(new Set(notebookTemplates.map(entry=>entry.id)),new Set(Object.keys(templateExpectations)));
  assert.equal(templateCategories.length,5);
  for(const category of templateCategories)assert.ok(notebookTemplates.some(entry=>entry.category===category.id));
  for(const entry of notebookTemplates) {
    const {input,result}=run(entry.id);
    assert.ok(entry.title&&entry.description);
    assert.ok(input.rows.every(row=>row.comment&&row.comment.trim().length>=4),entry.id);
    assert.ok(result.rows[0]!.coefficients,`${entry.id}: パラメータでなく代表級数を初期選択`);
    for(const [name,expected] of Object.entries(templateExpectations[entry.id]!))assert.deepEqual(find(input,result,name).coefficients!.slice(0,expected.length),expected,`${entry.id}: ${name}`);
    // 同じ数列の別表現や代入残差の行は、非定義・非解析の通常値として0を返す。
    for(const [i,row] of result.rows.entries()) {
      if(row.name!==null||row.analysis||!input.rows[i]!.source.includes('-'))continue;
      if(row.coefficients)assert.ok(row.coefficients.every(a=>a==='0'),`${entry.id}: ${input.rows[i]!.source}`);
      else assert.equal(row.value,'0',entry.id);
    }
    for(const row of result.rows) {
      if(row.tex)assert.doesNotThrow(()=>renderToString(row.tex!,{throwOnError:true,trust:false}),entry.id);
      if(row.resultTex)assert.doesNotThrow(()=>renderToString(row.resultTex!,{throwOnError:true,trust:false}),entry.id);
    }
  }
});

test('全サンプルはJSON・URL・読み込みundoで設定・初期値・連立・コメントを保持し、カタログを変更しない',()=>{
  const before=JSON.stringify(notebookTemplates);
  for(const entry of notebookTemplates) {
    const session=load(entry.id),other=importNotebook(exportNotebook(session));
    assert.deepEqual(notebookDocument(other),notebookDocument(session),entry.id);
    const shared=readShareHash(new URL(createShareUrl(session,'https://example.test/FPS-calculator/')).hash)!;
    assert.deepEqual(notebookDocument(shared),notebookDocument(session),entry.id);
    const model=new NotebookModel(load('fibonacci').input),history=new EditHistory<ReturnType<typeof model.snapshot>>();
    const original=model.snapshot();history.record(original);
    model.restore({input:other.input,selectedId:other.input.rows[0]!.id});const imported=model.snapshot();
    model.restore(history.undo(model.snapshot())!);assert.deepEqual(model.snapshot(),original);
    model.restore(history.redo(model.snapshot())!);assert.deepEqual(model.snapshot(),imported);
    other.input.rows[0]!.comment='編集してもカタログとは独立';
  }
  assert.equal(JSON.stringify(notebookTemplates),before);
});

test('分類・複数語・コメント・式の検索と説明付きプレビューを提供する',()=>{
  assert.equal(filterTemplates(notebookTemplates,'all','').length,52);
  assert.deepEqual(filterTemplates(notebookTemplates,'graphs','source 成分').map(entry=>entry.id),['strong-digraphs']);
  assert.deepEqual(filterTemplates(notebookTemplates,'all','B_1=-1/2').map(entry=>entry.id),['bernoulli']);
  assert.ok(filterTemplates(notebookTemplates,'all','Ｃａｔａｌａｎ').length>0);
  assert.equal(filterTemplates(notebookTemplates,'trees','DAG').length,0);
  assert.equal(filterTemplates(notebookTemplates,'all','not-a-sequence-123').length,0);
  const preview=previewTemplate(notebookTemplates.find(entry=>entry.id==='algebraic-system')!);
  assert.match(preview,/係数体: 有理数/);assert.match(preview,/定数項/);assert.match(preview,/未知数・初期係数:\nu=1/);assert.match(preview,/u=1\+X\*v/);
});

test('固定パラメータの境界とN=1で、空対象・分岐・追加精度を保つ',()=>{
  for(const entry of notebookTemplates)run(entry.id,input=>{input.terms=1;});
  for(const id of ['arithmetic','geometric','compositions','catalan-convolution','shifted-binomial','delannoy','narayana','stirling-columns','restricted-set-partitions','restricted-partitions']) {
    const {input,result}=run(id,input=>{
      for(const row of input.rows) {
        if(row.source.startsWith('ratio='))row.source='ratio=0';
        if(row.source.startsWith('offset='))row.source='offset=0';
        if(row.source.startsWith('height='))row.source='height=0';
        if(row.source.startsWith('size='))row.source='size=0';
        if(row.source.startsWith('peaks='))row.source='peaks=0';
        if(row.source.startsWith('k='))row.source='k=0';
        if(row.source.startsWith('limit='))row.source='limit=1';
        if(row.source.startsWith('r='))row.source='r=1';
      }
    });
    if(id==='narayana')assert.deepEqual(find(input,result,'Row').coefficients,['1',...Array(11).fill('0')]);
    if(id==='geometric')assert.deepEqual(find(input,result,'F').coefficients,['3',...Array(11).fill('0')]);
    if(id==='delannoy')assert.deepEqual(find(input,result,'Rectangle').coefficients,Array(12).fill('1'));
  }
});

test('EGFの表示は通常係数の階乗倍で、既定modでは全例、小標数では対応する例が動く',()=>{
  for(const entry of notebookTemplates) {
    const {input,result}=run(entry.id);
    const plain=calculate({...input,basis:input.basis==='egf'?'ogf':'egf'});
    assert.equal(plain.error,undefined);
    for(const row of plain.rows)assert.equal(row.error,undefined,entry.id);
    if(input.basis==='egf') {
      let factorial=1n;
      for(let n=0;n<Math.min(8,input.terms);n++) {
        if(n)factorial*=BigInt(n);
        // 整数EGFの代表例でも、内部は整数の個数をn!で割った有理数。
        const normal=plain.rows[0]!.coefficients![n]!,display=result.rows[0]!.coefficients![n]!;
        const [a,b='1']=normal.split('/'),[c,d='1']=display.split('/');
        assert.equal(BigInt(a!)*factorial*BigInt(d),BigInt(c!)*BigInt(b),`${entry.id}: ${n}`);
      }
    }
    run(entry.id,input=>{input.domain='prime';input.modulus='998244353';});
  }
  for(const id of ['arithmetic','geometric','fibonacci','lucas','tribonacci','tilings','compositions','plane-trees','algebraic-system','quadratic-branches','differential-recurrence','reversion-cycle'])run(id,input=>{input.domain='prime';input.modulus='2';});
  const partition=load('partitions').input;partition.domain='prime';partition.modulus='2';const result=calculate(partition);
  assert.equal(result.rows[0]!.error,undefined);assert.ok(result.rows.find(row=>row.name==='Q')!.error,'Euler変換の分母の障害は黙って回避しない');
});
