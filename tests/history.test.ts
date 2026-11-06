import test from 'node:test';
import assert from 'node:assert/strict';
import { EditHistory } from '../src/app/edit-history.ts';
import { NotebookModel, calculationChanged } from '../src/app/notebook-model.ts';
import type { NotebookSnapshot } from '../src/app/notebook-model.ts';
import { defaultSession, restoreSession, saveSession } from '../src/app/session.ts';
import { HISTORY_MERGE_MS, MAX_HISTORY_ENTRIES } from '../src/config/limits.ts';
import { setupHistoryShortcuts } from '../src/ui/interactions/history-shortcuts.ts';

function notebook() {
  let next = 0;
  const id = () => `history-row-${next++}`;
  const session = defaultSession(id);
  return { session, model: new NotebookModel(session.input, id) };
}

test('式の編集・追加・複製・移動・削除・計算設定を、IDと選択を含めてundo/redoできる', () => {
  const { session, model } = notebook();
  const history = new EditHistory<NotebookSnapshot>();
  const states = [model.snapshot()];
  const first = model.selectedId;
  function perform(action: () => unknown): void {
    const before = model.snapshot();
    assert.ok(action());
    history.record(before);
    states.push(model.snapshot());
  }
  perform(() => model.updateSource(first, 'F=2X'));
  perform(() => model.add('Catalan'));
  const added = model.selectedId;
  perform(() => model.duplicate(added));
  const copied = model.selectedId;
  perform(() => model.move(copied, 0));
  perform(() => model.remove(first));
  perform(() => model.updateSetting('domain', 'prime'));
  perform(() => model.updateSetting('modulus', '17'));
  perform(() => model.updateSetting('terms', 8));
  perform(() => model.updateSetting('basis', 'egf'));
  for (let i = states.length - 2; i >= 0; i--) {
    model.restore(history.undo(model.snapshot())!);
    assert.deepEqual(model.snapshot(), states[i]);
    assert.equal(model.input, session.input, '保存先のCalculation参照を維持する');
  }
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, true);
  for (let i = 1; i < states.length; i++) {
    model.restore(history.redo(model.snapshot())!);
    assert.deepEqual(model.snapshot(), states[i]);
  }
  assert.equal(model.selectedId, copied);
  assert.equal(history.canRedo, false);
});

test('最後の行を削除した後も元のID・内容・選択へ戻り、再実行では同じ空行IDを使う', () => {
  const { model } = notebook();
  while (model.input.rows.length > 1) model.remove(model.input.rows[0]!.id);
  const history = new EditHistory<NotebookSnapshot>();
  const before = model.snapshot();
  model.remove(model.selectedId);
  history.record(before);
  const empty = model.snapshot();
  assert.equal(model.selectedRow.source, '');
  model.restore(history.undo(model.snapshot())!);
  assert.deepEqual(model.snapshot(), before);
  model.restore(history.redo(model.snapshot())!);
  assert.deepEqual(model.snapshot(), empty);
});

test('連続した同じ欄の編集をまとめ、別の欄・時間経過・明示的な区切りで履歴を分ける', () => {
  let time = 0;
  const history = new EditHistory<string>(() => time);
  history.record('x', 'row-a');
  time += HISTORY_MERGE_MS - 1;
  history.record('x+', 'row-a');
  assert.equal(history.undo('x+1'), 'x');
  assert.equal(history.canUndo, false);
  assert.equal(history.redo('x'), 'x+1');
  history.record('x+1', 'row-a');
  time += HISTORY_MERGE_MS;
  history.record('x+2', 'row-a');
  history.record('x+3', 'row-b');
  history.breakGroup();
  history.record('y', 'row-b');
  assert.equal(history.undo('z'), 'y');
  assert.equal(history.undo('y'), 'x+3');
  assert.equal(history.undo('x+3'), 'x+2');
  assert.equal(history.undo('x+2'), 'x+1');
});

test('undo後の編集はredoを破棄し、操作不能・内容不変の操作ではredoを維持する', () => {
  const { model } = notebook();
  const history = new EditHistory<NotebookSnapshot>();
  const before = model.snapshot();
  model.updateSource(model.selectedId, '2X');
  history.record(before, 'source');
  model.restore(history.undo(model.snapshot())!);
  for (const action of [
    () => model.updateSource(model.selectedId, model.selectedRow.source),
    () => model.updateSource('missing', 'x'), () => model.remove('missing'),
    () => model.duplicate('missing'), () => model.move(model.input.rows[0]!.id, 0),
    () => model.updateSetting('terms', model.input.terms),
  ]) {
    const previous = model.snapshot();
    if (action()) history.record(previous);
    assert.equal(history.canRedo, true);
  }
  const branch = model.snapshot();
  model.updateSource(model.selectedId, '3X');
  history.record(branch, 'source');
  assert.equal(history.canRedo, false);
  model.restore(history.undo(model.snapshot())!);
  assert.deepEqual(model.snapshot(), before);
});

test('履歴は上限を守り、redoのあとも新しい操作を独立して取り消せる', () => {
  const history = new EditHistory<number>();
  assert.equal(history.undo(0), undefined);
  assert.equal(history.redo(0), undefined);
  for (let i = 0; i < MAX_HISTORY_ENTRIES + 7; i++) history.record(i);
  let current = MAX_HISTORY_ENTRIES + 7;
  let count = 0;
  while (history.canUndo) { current = history.undo(current)!; count++; }
  assert.equal(count, MAX_HISTORY_ENTRIES);
  assert.equal(current, 7);
  while (history.canRedo) current = history.redo(current)!;
  assert.equal(current, MAX_HISTORY_ENTRIES + 7);
  history.record(current, 'new');
  assert.equal(history.undo(999), current);
});

test('スナップショットは可変な入力と分離し、undoした状態を既存の保存形式で保存できる', () => {
  const { session, model } = notebook();
  const before = model.snapshot();
  model.updateSource(model.selectedId, 'x/0');
  model.updateSetting('terms', NaN);
  const invalid = model.snapshot();
  model.restore(before);
  model.updateSource(model.selectedId, 'LambertW(x)');
  assert.equal(before.input.rows[0]!.source, 'f = 1/(1-x)');
  assert.equal(invalid.input.rows[0]!.source, 'x/0');
  assert.ok(Number.isNaN(invalid.input.terms));
  model.restore(before);
  const saved = new Map<string, string>();
  const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); } };
  assert.equal(saveSession(storage, session), true);
  assert.deepEqual(restoreSession(storage).session.input.rows.map((row) => row.source), before.input.rows.map((row) => row.source));
  assert.equal(new EditHistory().canUndo, false, '再読み込み時に履歴を持ち越さない');
});

test('選択・行順だけの復元では再計算不要だが、式・ID・計算設定の復元には必要', () => {
  const { model } = notebook();
  const before = model.snapshot();
  model.select(model.input.rows[1]!.id);
  model.move(model.input.rows[0]!.id, 2);
  assert.equal(calculationChanged(before.input, model.input), false);
  model.updateSource(model.selectedId, '2X');
  assert.equal(calculationChanged(before.input, model.input), true);
  for (const key of ['domain', 'modulus', 'terms', 'basis'] as const) {
    model.restore(before);
    if (key === 'domain') model.updateSetting(key, 'prime');
    if (key === 'modulus') model.updateSetting(key, '17');
    if (key === 'terms') model.updateSetting(key, NaN);
    if (key === 'basis') model.updateSetting(key, 'egf');
    assert.equal(calculationChanged(before.input, model.input), true, key);
    assert.equal(calculationChanged(model.snapshot().input, model.input), false);
  }
  model.restore(before);
  model.input.rows[0]!.id = 'replacement';
  assert.equal(calculationChanged(before.input, model.input), true);
});

test('undo/redoのキー操作を1回だけ処理し、IME・Alt・既に処理されたキーを奪わない', () => {
  const root = new EventTarget();
  const calls: string[] = [];
  setupHistoryShortcuts(root as unknown as HTMLElement, { undo: () => calls.push('undo'), redo: () => calls.push('redo') });
  const key = (properties: object, prevented = false) => {
    const event = Object.assign(new Event('keydown', { cancelable: true }), { key: 'z', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, isComposing: false, keyCode: 0 }, properties);
    if (prevented) event.preventDefault();
    root.dispatchEvent(event);
    return event.defaultPrevented;
  };
  assert.equal(key({ ctrlKey: true }), true);
  assert.equal(key({ metaKey: true }), true);
  assert.equal(key({ ctrlKey: true, shiftKey: true, key: 'Z' }), true);
  assert.equal(key({ metaKey: true, shiftKey: true, key: 'Z' }), true);
  assert.equal(key({ ctrlKey: true, key: 'y' }), true);
  assert.deepEqual(calls, ['undo', 'undo', 'redo', 'redo', 'redo']);
  for (const properties of [{}, { ctrlKey: true, altKey: true }, { ctrlKey: true, isComposing: true }, { ctrlKey: true, keyCode: 229 }, { ctrlKey: true, key: 'v' }, { ctrlKey: true, shiftKey: true, key: 'y' }]) {
    assert.equal(key(properties), false);
  }
  key({ ctrlKey: true }, true);
  assert.equal(calls.length, 5);
});

test('ネイティブの履歴入力をアプリの履歴へ送り、キャンセル不能・変換中の入力は維持する', () => {
  const root = new EventTarget();
  const calls: string[] = [];
  setupHistoryShortcuts(root as unknown as HTMLElement, { undo: () => calls.push('undo'), redo: () => calls.push('redo') });
  const input = (inputType: string, cancelable = true, isComposing = false) => {
    const event = Object.assign(new Event('beforeinput', { cancelable }), { inputType, isComposing });
    root.dispatchEvent(event);
    return event.defaultPrevented;
  };
  assert.equal(input('historyUndo'), true);
  assert.equal(input('historyRedo'), true);
  assert.equal(input('insertText'), false);
  assert.equal(input('historyUndo', false), false);
  assert.equal(input('historyUndo', true, true), false);
  assert.deepEqual(calls, ['undo', 'redo']);
});

test('連立グループと再帰初期値を履歴から復元し、未作成だったsystemsも元へ戻せる', () => {
  const {session,model}=notebook();
  const history=new EditHistory<NotebookSnapshot>();
  const initial=model.snapshot();
  const system=model.addSystem()!; history.record(initial);
  const added=model.snapshot();
  model.updateSystem(system.id,'equations','u^2=1+x'); model.updateSystem(system.id,'variables','u=1');
  model.updateInitial(model.selectedId,'1');
  history.record(added);
  const edited=model.snapshot();
  model.restore(history.undo(model.snapshot())!);
  assert.deepEqual(model.snapshot(),added);
  model.restore(history.undo(model.snapshot())!);
  assert.deepEqual(model.snapshot(),initial);
  assert.equal(session.input.systems,undefined);
  model.restore(history.redo(model.snapshot())!);
  model.restore(history.redo(model.snapshot())!);
  assert.deepEqual(model.snapshot(),edited);
  model.updateSystem(system.id,'variables','u=-1');
  assert.equal(edited.input.systems![0]!.variables,'u=1');
  assert.equal(calculationChanged(added.input,edited.input),true);
});

test('連立グループと初期値を保存復元し、不正な追加データは従来どおり検証する', () => {
  const {session,model}=notebook();
  model.updateInitial(model.selectedId,'-1/2');
  const system=model.addSystem()!; model.updateSystem(system.id,'method','newton');
  const values=new Map<string,string>();
  const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  assert.equal(saveSession(storage,session),true);
  const restored=restoreSession(storage).session;
  assert.equal(restored.input.rows[0]!.initial,'-1/2');
  assert.equal(restored.input.systems![0]!.equations,system.equations);
  assert.equal(restored.input.systems![0]!.method,'newton');
  assert.equal(new Set([...restored.input.rows,...restored.input.systems!].map(row=>row.id)).size,5);
  for(const invalid of [{...system,method:'eval'},{...system,variables:4}]) {
    const key=[...values.keys()][0]!;
    values.set(key,JSON.stringify({version:1,data:{...session.input,systems:[invalid]}}));
    assert.equal(restoreSession(storage).session.input.systems,undefined);
  }
});
