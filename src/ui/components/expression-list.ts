import type { InputRow, RowResult } from '../../model/calculation.ts';
import { MAX_ROWS } from '../../config/limits.ts';
import { setupRowReordering } from '../interactions/reorder-rows.ts';
import { sizeExpressionInput } from '../interactions/input-scroll.ts';
import type { EditorState, ExpressionActions } from './expression-row-types.ts';
import { ExpressionRow } from './expression-row.ts';

/** IDでDOMを再利用し、編集・並べ替え中のフォーカスとスクロールを守る。 */
export class ExpressionList {
  private readonly list: HTMLElement;
  private readonly actions: ExpressionActions;
  private readonly rows = new Map<string, ExpressionRow>();
  private restoringFocus = false;
  private lastEditor:EditorState|null=null;

  constructor(list: HTMLElement, actions: ExpressionActions & { move(id: string, index: number): void }) {
    this.list = list; this.actions = actions;
    setupRowReordering(list, actions.move);
    list.addEventListener('focusout',event=>{
      const input=event.target;
      if(!(input instanceof HTMLInputElement||input instanceof HTMLTextAreaElement))return;
      const row=this.rows.get(input.closest<HTMLElement>('.expression-row')?.dataset.id??'');
      if(row)this.lastEditor=row.editorState(input.classList.contains('comment-input')?'comment':input.classList.contains('initial-input')?'initial':'source');
    });
  }
  render(rows: InputRow[], selectedId: string, results: ReadonlyMap<string, RowResult>, busy: boolean, names: readonly string[] = []): void {
    const active = this.list.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
    const input = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active : null;
    const selection = input ? [input.selectionStart, input.selectionEnd, input.selectionDirection] as const : null;
    const inputScroll=input?{left:input.scrollLeft,top:input.scrollTop}:null;
    const scroll = new Map([...this.rows].map(([id, row]) => [id, row.editor.scrollLeft]));
    const ids = new Set(rows.map((row) => row.id));
    for (const [id, row] of this.rows) if (!ids.has(id)) { row.destroy(); row.element.remove(); this.rows.delete(id); }
    rows.forEach((row, index) => {
      let component = this.rows.get(row.id);
      const created = !component;
      if (!component) {
        component = new ExpressionRow(row, this.actions, () => this.restoringFocus);
        this.rows.set(row.id, component);
      }
      if (this.list.children[index] !== component.element) this.list.insertBefore(component.element, this.list.children[index] ?? null);
      if (created) sizeExpressionInput(component.input);
      component.setNames(names);
      component.update(row, index, row.id === selectedId, rows.length < MAX_ROWS);
      component.renderResult(results.get(row.id), busy);
    });
    if (active?.isConnected && active !== document.activeElement) {
      this.restoringFocus = true;
      try {
        active.focus({ preventScroll: true });
        if (input && selection) input.setSelectionRange(selection[0], selection[1], selection[2] ?? undefined);
      } finally { this.restoringFocus = false; }
    }
    if(input&&inputScroll){input.scrollLeft=inputScroll.left;input.scrollTop=inputScroll.top;}
    for (const [id, position] of scroll) { const row = this.rows.get(id); if (row) row.editor.scrollLeft = position; }
  }
  focus(id: string): void { this.rows.get(id)?.input.focus(); }
  captureEditor(fallbackId: string): EditorState | null {
    const active = (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) && this.list.contains(document.activeElement)
      ? document.activeElement.closest<HTMLElement>('.expression-row') : null;
    if(!active&&this.lastEditor?.id===fallbackId&&this.rows.has(fallbackId))return {...this.lastEditor};
    return this.rows.get(active?.dataset.id ?? fallbackId)?.editorState(document.activeElement?.classList.contains('comment-input')?'comment':document.activeElement?.classList.contains('initial-input') ? 'initial' : 'source') ?? null;
  }
  restoreEditor(state: EditorState): void {
    const row = this.rows.get(state.id);
    if (!row) return;
    this.restoringFocus = true;
    try {
      const input = state.field === 'comment' ? row.comment.input : state.field === 'initial' ? row.initialInput : row.input;
      if (state.field === 'initial') row.initialInput.closest('details')!.open = true;
      if (state.field === 'comment') row.comment.element.open = true;
      input.focus({ preventScroll: true });
      input.setSelectionRange(state.start, state.end, state.direction);
      if (state.field === 'initial'||state.field==='comment') {input.scrollLeft=state.scrollLeft;input.scrollTop=state.scrollTop??0;} else row.editor.scrollLeft = state.scrollLeft;
      row.element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      this.lastEditor={...state};
    } finally { this.restoringFocus = false; }
  }
}
