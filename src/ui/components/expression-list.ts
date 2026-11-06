import type { InputRow, RowResult } from '../../model/calculation.ts';
import { setupRowReordering } from '../interactions/reorder-rows.ts';
import { sizeExpressionInput } from '../interactions/input-scroll.ts';
import type { ExpressionActions } from './expression-row.ts';
import { ExpressionRow } from './expression-row.ts';

/** IDでDOMを再利用し、編集・並べ替え中のフォーカスとスクロールを守る。 */
export class ExpressionList {
  private readonly list: HTMLElement;
  private readonly actions: ExpressionActions;
  private readonly rows = new Map<string, ExpressionRow>();
  private restoringFocus = false;

  constructor(list: HTMLElement, actions: ExpressionActions & { move(id: string, index: number): void }) {
    this.list = list; this.actions = actions;
    setupRowReordering(list, actions.move);
  }
  render(rows: InputRow[], selectedId: string, results: ReadonlyMap<string, RowResult>, busy: boolean): void {
    const active = this.list.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
    const input = active instanceof HTMLInputElement ? active : null;
    const selection = input ? [input.selectionStart, input.selectionEnd, input.selectionDirection] as const : null;
    const scroll = new Map([...this.rows].map(([id, row]) => [id, row.editor.scrollLeft]));
    const ids = new Set(rows.map((row) => row.id));
    for (const [id, row] of this.rows) if (!ids.has(id)) { row.element.remove(); this.rows.delete(id); }
    rows.forEach((row, index) => {
      let component = this.rows.get(row.id);
      const created = !component;
      if (!component) {
        component = new ExpressionRow(row, this.actions, () => this.restoringFocus);
        this.rows.set(row.id, component);
      }
      if (this.list.children[index] !== component.element) this.list.insertBefore(component.element, this.list.children[index] ?? null);
      if (created) sizeExpressionInput(component.input);
      component.update(row, index, row.id === selectedId);
      component.renderResult(results.get(row.id), busy);
    });
    if (active?.isConnected && active !== document.activeElement) {
      this.restoringFocus = true;
      try {
        active.focus({ preventScroll: true });
        if (input && selection) input.setSelectionRange(selection[0], selection[1], selection[2] ?? undefined);
      } finally { this.restoringFocus = false; }
    }
    for (const [id, position] of scroll) { const row = this.rows.get(id); if (row) row.editor.scrollLeft = position; }
  }
  focus(id: string): void { this.rows.get(id)?.input.focus(); }
}
