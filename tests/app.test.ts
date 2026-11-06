import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { MAX_ROWS } from '../src/config/limits.ts';
import type { Calculation, CalculationResult } from '../src/model/calculation.ts';
import { NotebookModel } from '../src/app/notebook-model.ts';
import { defaultSession, restoreSession, saveSession, STORAGE_KEY } from '../src/app/session.ts';
import type { SessionStorage } from '../src/app/session.ts';
import { CalculationClient } from '../src/app/calculation-client.ts';
import type { CalculationSnapshot, CalculationWorker } from '../src/app/calculation-client.ts';
import { resultCopyText, texCopyText } from '../src/ui/result-format.ts';

class MemoryStorage implements SessionStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}
function ids(): () => string { let id = 0; return () => `row-${id++}`; }

test('従来のversion:1の保存データと幅・表示形式を復元できる', () => {
  const storage = new MemoryStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data: {
    rows: [{ id: 'same', source: 'g=f+x' }, { id: 'same', source: 'f=exp(x)' }],
    terms: 8, domain: 'prime', modulus: '17', basis: 'egf', ignored: 'unknown',
  }, view: 'series', notebookWidth: 620 }));
  const restored = restoreSession(storage, ids());
  assert.equal(restored.storageAvailable, true);
  assert.equal(restored.session.presentation, 'series');
  assert.equal(restored.session.notebookWidth, 620);
  assert.deepEqual(restored.session.input.rows.map((row) => row.source), ['g=f+x', 'f=exp(x)']);
  assert.equal(new Set(restored.session.input.rows.map((row) => row.id)).size, 2);
  assert.equal('ignored' in restored.session.input, false);
  assert.equal(saveSession(storage, restored.session), true);
  const again = restoreSession(storage, ids()).session;
  assert.deepEqual(again.input, restored.session.input);
  assert.equal(again.presentation, 'series');
  assert.equal(again.notebookWidth, 620);
});

test('壊れた保存データと保存不能な環境でも編集用の初期値を取得する', () => {
  const storage = new MemoryStorage();
  storage.setItem(STORAGE_KEY, '{');
  assert.equal(restoreSession(storage, ids()).storageAvailable, false);
  const fallback = restoreSession(storage, ids()).session;
  assert.equal(fallback.input.rows.length, 4);
  const forbidden: SessionStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(restoreSession(forbidden, ids()).session.input.rows.length, 4);
  assert.equal(saveSession(forbidden, fallback), false);
  for (const data of [
    { ...fallback.input, rows: [] }, { ...fallback.input, terms: null },
    { ...fallback.input, rows: [{ source: 123 }] }, { ...fallback.input, rows: [{ source: 'x'.repeat(513) }] },
  ]) {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data }));
    assert.deepEqual(restoreSession(storage, ids()).session.input, defaultSession(ids()).input);
  }
});

test('行の移動でIDと選択を保持し、削除後の選択を現在の位置から決める', () => {
  const id = ids();
  const model = new NotebookModel(defaultSession(id).input, id);
  const row = model.input.rows[0]!;
  assert.equal(model.move(row.id, 2), true);
  assert.equal(model.selectedId, row.id);
  assert.equal(model.input.rows[2], row);
  const next = model.input.rows[3]!;
  model.remove(row.id);
  assert.equal(model.selectedId, next.id);
  assert.equal(model.move('missing', 0), false);
  assert.equal(model.select('missing'), false);
});

test('最後の行の削除は空行を残し、行数上限を越えて追加しない', () => {
  const id = ids();
  const input = defaultSession(id).input;
  const model = new NotebookModel(input, id);
  while (input.rows.length > 1) model.remove(input.rows[0]!.id);
  const previous = input.rows[0]!.id;
  model.remove(previous);
  assert.equal(model.selectedRow.source, '');
  assert.notEqual(model.selectedRow.id, previous);
  while (input.rows.length < MAX_ROWS) assert.ok(model.add('x'));
  assert.equal(model.add('x'), undefined);
  assert.equal(input.rows.length, MAX_ROWS);
});

class FakeWorker implements CalculationWorker {
  onmessage: CalculationWorker['onmessage'] = null;
  onerror: CalculationWorker['onerror'] = null;
  terminated = false;
  postMessage(_input: unknown): void { /* 応答時刻はテストから制御する。 */ }
  terminate(): void { this.terminated = true; }
  respond(result: CalculationResult): void {
    this.onmessage?.call(this as unknown as Worker, new MessageEvent('message', { data: result }));
  }
}
function workers() {
  const queue: FakeWorker[] = [];
  const waiting: Array<(worker: FakeWorker) => void> = [];
  return {
    create() {
      const worker = new FakeWorker();
      const resolve = waiting.shift();
      if (resolve) resolve(worker); else queue.push(worker);
      return worker;
    },
    next(): Promise<FakeWorker> {
      const worker = queue.shift();
      return worker ? Promise.resolve(worker) : new Promise((resolve) => waiting.push(resolve));
    },
  };
}
const request = (): Calculation => defaultSession(ids()).input;

test('入力更新でWorkerを終了し、遅い旧応答や完了後の重複応答を採用しない', async () => {
  const factory = workers();
  const history: CalculationSnapshot[] = [];
  const client = new CalculationClient((snapshot) => history.push(snapshot), { createWorker: factory.create, debounceMs: 0 });
  try {
    client.request(request());
    const old = await factory.next();
    client.request(request());
    assert.equal(old.terminated, true);
    const current = await factory.next();
    const count = history.length;
    old.respond({ rows: [{ id: 'old', name: null, value: 'old' }] });
    assert.equal(history.length, count);
    current.respond({ rows: [{ id: 'new', name: null, value: 'new' }] });
    assert.equal(history.at(-1)!.busy, false);
    assert.equal(history.at(-1)!.rows.get('new')!.value, 'new');
    assert.equal(current.terminated, true);
    current.respond({ rows: [] });
    assert.equal(history.at(-1)!.rows.has('new'), true);
  } finally { client.cancel(); }
});

test('デバウンス中の中断ではWorkerを起動しない', async () => {
  let created = 0;
  const client = new CalculationClient(() => {}, { createWorker() { created++; return new FakeWorker(); }, debounceMs: 0 });
  client.request(request()); client.cancel();
  await delay(5);
  assert.equal(created, 0);
});

test('Workerの時間超過を通知し、次の入力では正常な結果へ回復する', async () => {
  const factory = workers();
  const history: CalculationSnapshot[] = [];
  let finish!: (snapshot: CalculationSnapshot) => void;
  const timedOut = new Promise<CalculationSnapshot>((resolve) => { finish = resolve; });
  const client = new CalculationClient((snapshot) => {
    history.push(snapshot);
    if (!snapshot.busy) finish(snapshot);
  }, { createWorker: factory.create, debounceMs: 0, timeoutMs: 20 });
  try {
    client.request(request());
    const stalled = await factory.next();
    assert.match((await timedOut).error!, /中断/);
    assert.equal(stalled.terminated, true);
    client.request(request());
    assert.equal(history.at(-1)!.error, undefined);
    const recovered = await factory.next();
    recovered.respond({ rows: [{ id: 'ok', name: null, value: '1' }] });
    assert.equal(history.at(-1)!.rows.get('ok')!.value, '1');
    assert.equal(history.at(-1)!.error, undefined);
  } finally { client.cancel(); }
});

test('コピー書式は通常FPSの配列とLaurentの最低次数付きJSONを維持する', () => {
  const base = { id: 'f', name: 'f', coefficients: ['1', '0'], startDegree: 0, tex: 'f=1', resultTex: '1+O(x^2)' };
  assert.equal(resultCopyText({ ...base, valueType: 'fps' }), '[1, 0]');
  assert.deepEqual(JSON.parse(resultCopyText({ ...base, valueType: 'laurent', startDegree: -1 })!), { startDegree: -1, coefficients: ['1', '0'] });
  assert.equal(resultCopyText({ id: 's', name: null, valueType: 'scalar', value: '0' }), '0');
  assert.equal(texCopyText({ ...base, valueType: 'fps' }), 'f=1\n\n1+O(x^2)');
});
