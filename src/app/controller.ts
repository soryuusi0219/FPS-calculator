import type { CalculationSnapshot } from './calculation-client.ts';
import { CalculationClient } from './calculation-client.ts';
import { NotebookModel } from './notebook-model.ts';
import { restoreSession, saveSession } from './session.ts';
import type { SessionStorage } from './session.ts';
import { createShell } from '../ui/shell.ts';
import { NotebookView } from '../ui/components/notebook-view.ts';
import { InspectorView } from '../ui/components/inspector-view.ts';
import { setupNotebookResize } from '../ui/interactions/resize-panel.ts';

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
  let calculation: CalculationSnapshot = { busy: false, rows: new Map(), error: undefined };
  const shell = createShell(root);
  const notebook = new NotebookView(shell.notebook, {
    select(id) { if (model.select(id)) render(); },
    edit(id, source) { model.updateSource(id, source); recalculate(); },
    add() { addRow(); },
    remove(id) { if (model.remove(id)) recalculate(); },
    move(id, index) {
      if (!model.move(id, index)) return;
      persist(); render(); notebook.announceMove(index);
    },
    domain(value) { model.input.domain = value; recalculate(); },
    terms(value) { model.input.terms = value; recalculate(); },
    modulus(value) { model.input.modulus = value; recalculate(); },
  });
  const inspector = new InspectorView(shell.inspector, {
    basis(value) { model.input.basis = value; recalculate(); },
    presentation(value) { session.presentation = value; persist(); render(); },
    add: addRow,
  });
  const client = new CalculationClient((snapshot) => { calculation = snapshot; render(); });

  function persist(): void { notebook.showStorage(saveSession(storage, session)); }
  function render(): void {
    notebook.render(model.input, model.selectedId, calculation.rows, calculation.busy);
    inspector.render({ input: model.input, selectedRow: model.selectedRow, result: calculation.rows.get(model.selectedId), calculation, presentation: session.presentation });
  }
  function recalculate(): void { persist(); client.request(model.input); }
  function addRow(source = ''): void {
    const row = model.add(source);
    if (!row) return;
    recalculate(); notebook.focus(row.id);
  }

  setupNotebookResize({
    workspace: shell.workspace, separator: shell.separator, toggle: notebook.expandButton,
    initialWidth: session.notebookWidth,
    onChange(width) { session.notebookWidth = width; persist(); },
  });
  notebook.showStorage(restored.storageAvailable);
  window.addEventListener('pagehide', () => client.cancel());
  recalculate();
}
