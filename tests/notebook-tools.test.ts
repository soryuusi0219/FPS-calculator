import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSession, restoreSession, STORAGE_KEY } from '../src/app/session.ts';
import type { Session } from '../src/app/session.ts';
import { decodeNotebook, exportNotebook, importNotebook, notebookDocument } from '../src/app/notebook-document.ts';
import { createShareUrl, readShareHash } from '../src/app/sharing.ts';
import { declaredNames, renameVariable } from '../src/app/rename-variable.ts';
import { notebookTemplates, templateCategories, filterTemplates } from '../src/app/templates.ts';
import { completions, bracketMatches, syntaxDiagnostic } from '../src/language/editor-analysis.ts';
import { parse, parseEquation } from '../src/language/parser.ts';
import { SourceError } from '../src/language/source.ts';
import { tokenize } from '../src/language/tokens.ts';
import { calculate } from '../src/workbook.ts';
import { MAX_NOTEBOOK_BYTES, MAX_SHARE_URL_LENGTH } from '../src/config/limits.ts';
import { EditHistory } from '../src/app/edit-history.ts';

function ids() { let n=0; return () => `new-${n++}`; }
function note(sources = ['f=1+x*f^2','g=f+x']): Session {
  const session=defaultSession(ids());
  session.input.rows=sources.map((source,i)=>({id:`old-${i}`,source}));
  session.input.terms=6; return session;
}
function sameNote(a: Session,b: Session) { assert.deepEqual(notebookDocument(a),notebookDocument(b)); }

test('JSONは行順・初期値・連立設定・係数体・基底・表示形式を往復し、端末固有情報を持ち出さない',()=>{
  const before=note();before.input.rows[0]!.initial='1';before.input.domain='prime';before.input.modulus='17';before.input.basis='egf';before.presentation='series';before.notebookWidth=640;
  before.input.systems=[{id:'old-system',variables:'u=1\nv=0',equations:'u=1+x*v\nv=x*u',method:'newton'}];
  const text=exportNotebook(before), saved=JSON.parse(text);
  assert.equal(saved.format,'fps-calculator');assert.equal(saved.version,1);
  assert.equal('notebookWidth' in saved,false);assert.equal('id' in saved.data.rows[0],false);assert.equal('id' in saved.data.systems[0],false);
  const after=importNotebook(text,ids());sameNote(before,after);assert.equal(after.notebookWidth,null);
  assert.notEqual(after.input.rows[0]!.id,before.input.rows[0]!.id);assert.equal(new Set([...after.input.rows,...after.input.systems!].map(row=>row.id)).size,3);
  assert.deepEqual(calculate(after.input).rows.map(r=>r.coefficients),calculate(before.input).rows.map(r=>r.coefficients));
});

test('既存ブラウザ保存との互換性・BOM・編集中の式とmodを保持する',()=>{
  const legacy={version:1,data:note(['f=','missing + 日本語']).input,view:'series',notebookWidth:600};
  legacy.data.modulus='';
  const text=JSON.stringify(legacy);
  assert.equal(importNotebook('\uFEFF'+text,ids()).input.rows[1]!.source,'missing + 日本語');
  assert.equal(importNotebook(text,ids()).input.modulus,'');
  const restored=restoreSession({getItem:key=>key===STORAGE_KEY?text:null,setItem(){}},ids());
  assert.equal(restored.session.notebookWidth,600);assert.equal(restored.session.presentation,'series');
  sameNote(restored.session,importNotebook(exportNotebook(restored.session),ids()));
});

test('JSONの不正形式・未知version・容量/行数/文字数超過を反映前に拒否する',()=>{
  const original=note(), saved=exportNotebook(original);
  for(const mutate of [
    (d:any)=>{d.version=2;}, (d:any)=>{d.format='other';}, (d:any)=>{d.data.rows=[];},
    (d:any)=>{d.data.rows=Array(31).fill({source:'x'});}, (d:any)=>{d.data.rows[0].source='x'.repeat(513);},
    (d:any)=>{d.data.rows[0].initial=1;}, (d:any)=>{d.data.terms=1.5;}, (d:any)=>{d.data.domain='real';},
    (d:any)=>{d.data.systems=[{variables:'u',equations:'u=x',method:'bad'}];},
    (d:any)=>{d.data.systems=[{variables:'u',equations:'u=x',method:['auto']}];},
    (d:any)=>{d.data.systems=[{variables:'u',equations:'x'.repeat(4097),method:'auto'}];},
  ]){const data=JSON.parse(saved);mutate(data);assert.throws(()=>decodeNotebook(data,ids()),/読み込めません/);}
  assert.throws(()=>importNotebook('{'),/JSON/);assert.throws(()=>importNotebook(' '.repeat(MAX_NOTEBOOK_BYTES+1)),/256 KiB/);
  assert.equal(exportNotebook(original),saved);
});

test('共有URLはサブパスとクエリを維持し、Unicodeと全設定を再現する',()=>{
  const before=note(['f=x','f + 日本語']);before.input.rows[0]!.initial='1';before.presentation='series';
  before.input.systems=[{id:'s',variables:'u=0',equations:'u=x',method:'coefficient'}];
  const url=new URL(createShareUrl(before,'https://example.com/FPS-calculator/?q=1#old'));
  assert.equal(url.pathname,'/FPS-calculator/');assert.equal(url.search,'?q=1');assert.match(url.hash,/^#notebook=[A-Za-z0-9_-]+$/);
  sameNote(before,readShareHash(url.hash)!);assert.equal(readShareHash('#other'),null);
});

test('不正共有URLと長すぎる共有を拒否し、JSON経路を残す',()=>{
  for(const hash of ['#notebook=','#notebook=a','#notebook=%%%','#notebook=_w','#notebook=e30','#notebook='+'a'.repeat(MAX_SHARE_URL_LENGTH)])assert.throws(()=>readShareHash(hash));
  const big=note(Array.from({length:30},()=> 'f='+'x+'.repeat(250)+'1'));
  assert.throws(()=>createShareUrl(big,'https://example.com/'),/JSON/);assert.ok(exportNotebook(big).length>12000);
});

test('一括変更は自己参照・初期値・複数文字名を扱い、書式とIDを保つ',()=>{
  const before=note(['f = 1 + x*f^2','ff=f+1',' 2f + ff ']);before.input.rows[0]!.initial='ff[0]';
  const text=JSON.stringify(before.input), renamed=renameVariable(before.input,'f','tree');
  assert.deepEqual(renamed.input.rows.map(row=>row.source),['tree = 1 + x*tree^2','ff=tree+1',' 2tree + ff ']);
  assert.equal(renamed.input.rows[0]!.initial,'ff[0]');assert.equal(renamed.count,4);
  assert.deepEqual(renamed.input.rows.map(row=>row.id),before.input.rows.map(row=>row.id));assert.equal(JSON.stringify(before.input),text);
});

test('連立未知数の宣言・両辺・複数行の初期値参照を一括変更する',()=>{
  const before=note(['f=1','u+f']);before.input.rows[0]!.initial='u[0]';
  before.input.systems=[{id:'s',variables:'u\r\nv=f[0]',equations:'u = 1+x*v\r\nv = x*u',method:'auto'}];
  const renamed=renameVariable(before.input,'u','root');
  assert.equal(renamed.input.systems![0]!.variables,'root\r\nv=f[0]');
  assert.equal(renamed.input.systems![0]!.equations,'root = 1+x*v\r\nv = x*root');
  assert.equal(renamed.input.rows[0]!.initial,'root[0]');assert.equal(renamed.input.rows[1]!.source,'root+f');
  assert.deepEqual(declaredNames(before.input),['f','u','v']);assert.equal(renamed.count,5);
});

test('ラムダの局所名を変更せず、自由参照とmapの束縛を区別する',()=>{
  const before=note(['f=2','fps(f=>f+1)','fps(t=>f+t)','map(x,(f,i)=>f+i)','i=3','map(x,a+i^2)','i+f']);
  const renamed=renameVariable(before.input,'f','g');
  assert.deepEqual(renamed.input.rows.map(r=>r.source),['g=2','fps(f=>f+1)','fps(t=>g+t)','map(x,(f,i)=>f+i)','i=3','map(x,a+i^2)','i+g']);
  const indices=renameVariable(before.input,'i','index');
  assert.equal(indices.input.rows[3]!.source,'map(x,(f,i)=>f+i)');assert.equal(indices.input.rows[5]!.source,'map(x,a+i^2)');assert.equal(indices.input.rows[6]!.source,'index+f');
  const a=calculate(before.input).rows, b=calculate(renamed.input).rows;
  assert.deepEqual(a.map(r=>[r.error,r.value,r.coefficients]),b.map(r=>[r.error,r.value,r.coefficients]));
});

test('名前の衝突・局所名への捕獲・不正な式・長さ超過は部分変更しない',()=>{
  for(const [sources,from,to,pattern] of [
    [['f=1','g=2'],'f','g',/既に/], [['f=1'],'f','exp',/予約語/],
    [['f=1','fps(t=>f+t)'],'f','t',/捕獲/], [['f=1','map(x,a+f)'],'f','i',/捕獲/],
    [['f=1','g='],'f','h',/式 2/], [['f=1','f=2'],'f','g',/1回/],
    [['f=1'],'g','h',/1回/], [['f=1','f+'.repeat(255)+'f'],'f','veryLongName',/512/],
  ] as const){const before=note([...sources]);const saved=JSON.stringify(before.input);assert.throws(()=>renameVariable(before.input,from,to),pattern);assert.equal(JSON.stringify(before.input),saved);}
});

test('名前付きmapラムダの動的な補助名が変わる変更を拒否する',()=>{
  const before=note(['i=7','h=t=>i','alias=h','map(x,alias)','h(1)']);
  const values=calculate(before.input).rows;
  assert.deepEqual(values[3]!.coefficients,['0','1','2','3','4','5']);assert.equal(values[4]!.value,'7');
  assert.throws(()=>renameVariable(before.input,'i','index'),/補助名 i/);
  assert.throws(()=>renameVariable(note(['f=7','h=t=>f','map(x,h)']).input,'f','i'),/補助名 i/);
  assert.doesNotThrow(()=>renameVariable(note(['f=7','h=i=>f+i','map(x,h)']).input,'f','g'));
  assert.doesNotThrow(()=>renameVariable(note(['i=7','h=t=>t','map(x,h)']).input,'i','index'));
});

test('字句解析は不正文字の位置を維持し、パーサと編集色分けで共用する',()=>{
  assert.deepEqual(tokenize('f = 2X').map(t=>[t.text,t.kind,t.position,t.end]),[['f','identifier',0,1],[' ','space',1,2],['=','operator',2,3],[' ','space',3,4],['2','integer',4,5],['X','identifier',5,6]]);
  assert.throws(()=>tokenize('x@'),(e:unknown)=>e instanceof SourceError&&e.start===1&&e.end===2);
  assert.equal(tokenize('x@',true)[1]!.kind,'invalid');
  const statement=parse('  foo = x');assert.deepEqual(statement.nameSpan,{start:2,end:5});assert.deepEqual(statement.expression,{kind:'symbol',name:'x',span:{start:8,end:9}});
});

test('構文エラーはEOF・連立右辺・改行の位置を保持する',()=>{
  assert.equal(syntaxDiagnostic('f=1+','statement')!.start,4);
  assert.equal(syntaxDiagnostic('1@x','statement')!.start,1);
  assert.deepEqual([syntaxDiagnostic('  exp=1','statement')!.start,syntaxDiagnostic('  exp=1','statement')!.end],[2,5]);
  assert.equal(syntaxDiagnostic('f=1','scalar')!.start,0);
  const diagnostic=syntaxDiagnostic('u=1+x\nv=1+','equations')!;assert.equal(diagnostic.start,10);assert.equal(diagnostic.end,10);
  assert.throws(()=>parseEquation('u=1+',20),(e:unknown)=>e instanceof SourceError&&e.start===24);
  assert.equal(syntaxDiagnostic('u\nv=1','variables'),undefined);
  assert.equal(syntaxDiagnostic('','statement'),undefined);
});

test('Workerの結果に構文エラーと未定義変数の範囲が渡る',()=>{
  const result=calculate(note(['f=1+','x+missing','f=exp(1)']).input);
  assert.equal(result.rows[0]!.diagnostic!.start,4);
  assert.deepEqual(result.rows[1]!.diagnostic,{start:2,end:9,message:'未定義の変数: missing'});
  assert.ok(result.rows[2]!.diagnostic);
  const referenced=calculate(note(['longName=missing','longName+x','lambda=t=>missing','lambda(1)']).input);
  assert.equal(referenced.rows[0]!.diagnostic!.start,9);
  assert.deepEqual([referenced.rows[1]!.diagnostic!.start,referenced.rows[1]!.diagnostic!.end],[0,8]);
  assert.deepEqual([referenced.rows[3]!.diagnostic!.start,referenced.rows[3]!.diagnostic!.end],[0,8]);
});

test('括弧の対応と不一致を求め、補完は関数・宣言済み名・局所名を含む',()=>{
  assert.deepEqual(bracketMatches('f(x[1])',1).matching,[1,6]);
  assert.deepEqual(bracketMatches('([)]',4).invalid.sort((a,b)=>a-b),[0,1,2,3]);
  assert.deepEqual(bracketMatches('(x',2).invalid,[0]);
  assert.ok(completions('ex',2,[]).items.some(item=>item.name==='exp'&&item.kind==='function'));
  assert.ok(completions('tr',2,['tree']).items.some(item=>item.name==='tree'&&item.kind==='variable'));
  assert.ok(completions('fps(local=>loc',14,[]).items.some(item=>item.name==='local'));
  assert.deepEqual(completions('x',1,[]).items,[]);assert.deepEqual(completions('f',1,['f']).items,[]);assert.ok(completions('x',1,[],true).items.some(item=>item.name==='x'));
  assert.ok(completions('Cat',3,[]).items.some(item=>item.name==='Catalan'&&item.kind==='variable'));
  assert.deepEqual(completions('exp(',3,[]).items,[]);
});

test('サンプル集は分類・検索の枠だけで内容を持たない',()=>{
  assert.deepEqual(notebookTemplates,[]);assert.equal(templateCategories.length,4);
  const fixture=[{id:'test',title:'SEARCH',description:'説明',category:'trees' as const,document:{}}];
  assert.equal(filterTemplates(fixture,'trees',' search ').length,1);assert.equal(filterTemplates(fixture,'all','説明').length,1);assert.equal(filterTemplates(fixture,'systems','').length,0);
});

test('読み込みの履歴だけ表示形式を復元し、通常編集のundoで表示設定を戻さない',()=>{
  interface Snapshot { source:string; presentation?:string }
  const history=new EditHistory<Snapshot>();let source='old',view='table';
  const apply=(redo=false)=>{const adapt=(current:Snapshot,target:Snapshot)=>target.presentation===undefined?current:{...current,presentation:view};const target=redo?history.redo({source},adapt):history.undo({source},adapt);if(target){source=target.source;view=target.presentation??view;}};
  history.record({source,presentation:view});source='loaded';view='series';
  history.record({source});source='edit';view='table';apply();assert.equal(source,'loaded');assert.equal(view,'table');
  apply();assert.equal(source,'old');assert.equal(view,'table');apply(true);assert.equal(source,'loaded');assert.equal(view,'table');
  apply(true);assert.equal(source,'edit');
});
