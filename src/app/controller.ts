import type { CalculationSnapshot } from './calculation-client.ts';
import { CalculationClient } from './calculation-client.ts';
import { NotebookModel, calculationChanged } from './notebook-model.ts';
import type { NotebookSnapshot } from './notebook-model.ts';
import { EditHistory } from './edit-history.ts';
import { restoreSession, saveSession } from './session.ts';
import { exportNotebook, importNotebook, decodeNotebook } from './notebook-document.ts';
import { createShareUrl, readShareHash } from './sharing.ts';
import { renameVariable } from './rename-variable.ts';
import { notebookTemplates } from './templates.ts';
import type { Session, Presentation } from './session.ts';
import type { SessionStorage } from './session.ts';
import { createShell } from '../ui/shell.ts';
import { NotebookView } from '../ui/components/notebook-view.ts';
import type { NotebookFocus } from '../ui/components/notebook-view.ts';
import { InspectorView } from '../ui/components/inspector-view.ts';
import { setupNotebookResize } from '../ui/interactions/resize-panel.ts';
import { setupHistoryShortcuts } from '../ui/interactions/history-shortcuts.ts';

interface HistorySnapshot { notebook: NotebookSnapshot; focus: NotebookFocus; presentation?: Presentation }

/** UIの操作をモデル・保存・計算へつなぐ。DOMの作成と描画は各Viewが所有する。 */
export function mountCalculator(root: HTMLElement): void {
  // localStorage自体へのアクセスが拒否される環境も、session層で捕捉できる形にする。
  const storage: SessionStorage = {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
  };
  const restored = restoreSession(storage);
  const session = restored.session;
  const model = new NotebookModel(session.input);
  const history = new EditHistory<HistorySnapshot>();
  let calculation: CalculationSnapshot = { busy: false, rows: new Map(), error: undefined };
  const shell = createShell(root);
  const notebook = new NotebookView(shell.notebook, {
    exportJson: () => exportNotebook(session),
    importJson: (text) => replaceDocument(importNotebook(text)),
    shareUrl: () => createShareUrl(session, location.href),
    rename(from, to) {
      const result = renameVariable(model.input, from, to);
      if (result.count) {
        change(() => { model.restore({ input: result.input, selectedId: model.selectedId }); return true; });
        recalculate();
      }
      return result.count;
    },
    loadTemplate(id) {
      const template = notebookTemplates.find(entry => entry.id === id);
      if (!template) throw new Error('サンプルが見つかりません。');
      replaceDocument(decodeNotebook(template.document));
    },
    select(id) { if (model.select(id)) { history.breakGroup(); render(); } },
    edit(id, source, before) {
      if (change(() => model.updateSource(id, source), `source:${id}`, before ? { kind: 'expression', editor: before } : undefined)) recalculate();
    },
    initial(id, value, before) {
      if (change(() => model.updateInitial(id, value), `initial:${id}`, before ? { kind: 'expression', editor: before } : undefined)) recalculate();
    },
    comment(id,value,before) {
      if(change(()=>model.updateComment(id,value),`comment:${id}`,before?{kind:'expression',editor:before}:undefined)){persist();render();}
    },
    addSystem() { const system = change(() => model.addSystem()); if (system) { recalculate(); notebook.focusSystem(system.id); } },
    removeSystem(id) { if (change(() => model.removeSystem(id))) recalculate(); },
    editSystem(id, field, value, before) {
      if (change(() => model.updateSystem(id, field, value), `system:${id}:${field}`, before ? { kind: 'system', editor: before } : undefined)) recalculate();
    },
    systemMethod(id, value) { if (change(() => model.updateSystem(id, 'method', value))) recalculate(); },
    inspectSystem: (name) => addRow(name),
    breakHistoryGroup: () => history.breakGroup(),
    undo: () => restoreHistory(false),
    redo: () => restoreHistory(true),
    add() { addRow(); },
    duplicate(id) {
      const row = change(() => model.duplicate(id));
      if (!row) return;
      recalculate(); notebook.focus(row.id);
    },
    remove(id) { if (change(() => model.remove(id))) recalculate(); },
    move(id, index) {
      if (!change(() => model.move(id, index))) return;
      persist(); render(); notebook.announceMove(index);
    },
    domain(value) { if (change(() => model.updateSetting('domain', value))) recalculate(); },
    terms(value) { if (change(() => model.updateSetting('terms', value), 'terms')) recalculate(); },
    modulus(value) { if (change(() => model.updateSetting('modulus', value), 'modulus')) recalculate(); },
  });
  const inspector = new InspectorView(shell.inspector, {
    basis(value) { if (change(() => model.updateSetting('basis', value))) recalculate(); },
    presentation(value) { history.breakGroup(); session.presentation = value; persist(); render(); },
    add: addRow,
  });
  const client = new CalculationClient((snapshot) => { calculation = snapshot; render(); });

  function persist(): void { notebook.showStorage(saveSession(storage, session)); }
  function snapshot(focus = notebook.captureFocus(model.selectedId)): HistorySnapshot { return { notebook: model.snapshot(), focus }; }
  function change<T>(mutate: () => T, group?: string, focus?: NotebookFocus): T {
    const before = snapshot(focus);
    const changed = mutate();
    if (changed) history.record(before, group);
    return changed;
  }
  function restoreHistory(redo: boolean): void {
    const current = snapshot();
    const adapt = (value: HistorySnapshot, target: HistorySnapshot): HistorySnapshot => target.presentation === undefined ? value : { ...value, presentation: session.presentation };
    const previous = redo ? history.redo(current, adapt) : history.undo(current, adapt);
    if (!previous) return;
    model.restore(previous.notebook);
    if (previous.presentation !== undefined) session.presentation = previous.presentation;
    persist();
    if (calculationChanged(current.notebook.input, model.input)) client.request(model.input);
    else render();
    notebook.restoreFocus(previous.focus);
    notebook.announceHistory(redo);
  }
  function replaceDocument(imported: Session): void {
    const before = { ...snapshot(), presentation: session.presentation };
    model.restore({ input: imported.input, selectedId: imported.input.rows[0]!.id });
    session.presentation = imported.presentation;
    history.record(before);
    recalculate(); notebook.focus(model.selectedId);
  }
  function importHash(): void {
    try {
      const imported = readShareHash(location.hash);
      if (!imported) return;
      replaceDocument(imported);
      window.history.replaceState(null, '', location.pathname + location.search);
      notebook.showDocumentStatus('共有ノートを読み込みました。元に戻すで読み込み前に戻れます。');
    } catch (error) { notebook.showDocumentStatus(error instanceof Error ? error.message : String(error), true); }
  }
  function render(): void {
    notebook.render(model.input, model.selectedId, calculation.rows, calculation.busy, calculation.systems);
    notebook.renderHistory(history.canUndo, history.canRedo);
    inspector.render({ input: model.input, selectedRow: model.selectedRow, result: calculation.rows.get(model.selectedId), calculation, presentation: session.presentation });
  }
  function recalculate(): void { persist(); client.request(model.input); }
  function addRow(source = ''): void {
    const row = change(() => model.add(source));
    if (!row) return;
    recalculate(); notebook.focus(row.id);
  }

  setupHistoryShortcuts(root, { undo: () => restoreHistory(false), redo: () => restoreHistory(true) });
  setupNotebookResize({
    workspace: shell.workspace, separator: shell.separator, toggle: notebook.expandButton,
    initialWidth: session.notebookWidth,
    onChange(width) { session.notebookWidth = width; persist(); },
  });
  notebook.showStorage(restored.storageAvailable);
  window.addEventListener('pagehide', () => client.cancel());
  recalculate();
  importHash();
  window.addEventListener('hashchange', importHash);
}
