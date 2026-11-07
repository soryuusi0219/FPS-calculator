import test from 'node:test';
import assert from 'node:assert/strict';
import { NotebookModel, calculationChanged } from '../src/app/notebook-model.ts';
import type { NotebookSnapshot } from '../src/app/notebook-model.ts';
import { EditHistory } from '../src/app/edit-history.ts';
import { defaultSession, restoreSession, saveSession, STORAGE_KEY } from '../src/app/session.ts';
import { decodeNotebook, exportNotebook, importNotebook, notebookDocument } from '../src/app/notebook-document.ts';
import { createShareUrl, readShareHash } from '../src/app/sharing.ts';
import { renameVariable } from '../src/app/rename-variable.ts';
import { MAX_COMMENT_LENGTH } from '../src/config/limits.ts';
import { calculate } from '../src/workbook.ts';
import { completions } from '../src/language/editor-analysis.ts';

function note() {let n=0;const id=()=>`comment-${n++}`;const session=defaultSession(id);session.input.rows=[{id:id(),source:'F=egf(n=>1)'}];session.input.terms=6;return {session,model:new NotebookModel(session.input,id),id};}

test('コメントは計算・名前変更と独立し、編集・削除・複製・行移動・履歴で保たれる',()=>{
  const {session,model}=note(),first=model.selectedId,history=new EditHistory<NotebookSnapshot>();
  const before=model.snapshot(),math=calculate(session.input);
  assert.equal(model.updateComment(first,'F は exp(X)\n日本語のメモ <script>未実行</script>'),true);history.record(before);
  assert.equal(calculationChanged(before.input,model.input),false);assert.deepEqual(calculate(session.input),math);
  const commented=model.snapshot();model.restore(history.undo(model.snapshot())!);assert.equal(model.selectedRow.comment,undefined);model.restore(history.redo(model.snapshot())!);assert.deepEqual(model.snapshot(),commented);
  const copy=model.duplicate(first)!;assert.notEqual(copy.id,first);assert.equal(copy.comment,model.input.rows[0]!.comment);
  model.updateComment(copy.id,'コピー側のメモ');assert.equal(model.input.rows[0]!.comment,commented.input.rows[0]!.comment);
  model.move(copy.id,0);assert.equal(model.selectedRow.comment,'コピー側のメモ');model.remove(copy.id);assert.equal(model.selectedId,first);
  const renamed=renameVariable(session.input,'F','G');assert.equal(renamed.input.rows[0]!.comment,model.selectedRow.comment);
  assert.equal(model.updateComment(first,''),true);assert.equal(model.selectedRow.comment,undefined);assert.equal(model.updateComment(first,''),false);
  assert.equal(model.updateComment('missing','メモ'),false);assert.throws(()=>model.updateComment(first,'a'.repeat(MAX_COMMENT_LENGTH+1)),/2000/);
});

test('コメントは旧形式と互換なJSON・ブラウザ保存・共有URLで往復する',()=>{
  const {session,model,id}=note();const comment='組合せのEGF: a_n = 1\n📚 sin と revert は計算例だけ。';model.updateComment(model.selectedId,comment);
  const json=exportNotebook(session),document=JSON.parse(json);assert.equal(document.version,1);assert.equal(document.data.rows[0].comment,comment);assert.equal('id' in document.data.rows[0],false);
  assert.deepEqual(notebookDocument(importNotebook(json,id)),notebookDocument(session));
  let stored='';assert.equal(saveSession({getItem:()=>null,setItem:(key,value)=>{assert.equal(key,STORAGE_KEY);stored=value;}},session),true);
  const restored=restoreSession({getItem:()=>stored,setItem(){}},id).session;assert.equal(restored.input.rows[0]!.comment,comment);
  const url=createShareUrl(session,'https://example.test/FPS-calculator/');assert.equal(readShareHash(new URL(url).hash)!.input.rows[0]!.comment,comment);
  const legacy=JSON.parse(json);delete legacy.data.rows[0].comment;assert.equal(decodeNotebook(legacy,id).input.rows[0]!.comment,undefined);
});

test('不正なコメントは共通検証で拒否し、既存ノートを変更しない',()=>{
  const {session}=note();const before=JSON.stringify(session);
  for(const comment of [null,1,{},[],true,'a'.repeat(MAX_COMMENT_LENGTH+1)]) {
    const document=notebookDocument(session);Object.assign(document.data.rows[0]!,{comment});
    assert.throws(()=>decodeNotebook(document),/コメント/);assert.throws(()=>importNotebook(JSON.stringify(document)),/コメント/);
  }
  assert.equal(JSON.stringify(session),before);
  const max=notebookDocument(session);Object.assign(max.data.rows[0]!,{comment:'a'.repeat(MAX_COMMENT_LENGTH)});assert.equal(decodeNotebook(max).input.rows[0]!.comment!.length,MAX_COMMENT_LENGTH);
});

test('EGFと三角関数の補完は共通レジストリに従い、名前変更でも予約語を検証する',()=>{
  for(const name of ['egf','sin','arccos','tanh','csc','acosh'])assert.ok(completions(name,name.length,[],true).items.some(item=>item.name===name));
  const {session}=note();for(const reserved of ['egf','sin','arccos','tanh','csc'])assert.throws(()=>renameVariable(session.input,'F',reserved),/予約語/);
});
