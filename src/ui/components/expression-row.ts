import { MAX_EXPRESSION_LENGTH } from '../../config/limits.ts';
import type { InputRow, RowResult } from '../../model/calculation.ts';
import { revealInputCaret, sizeExpressionInput } from '../interactions/input-scroll.ts';
import { CodeEditor } from '../interactions/code-editor.ts';
import { rowPreview } from '../result-format.ts';

export interface EditorState {
  id: string;
  start: number;
  end: number;
  direction: 'forward' | 'backward' | 'none';
  scrollLeft: number;
  field?: 'source' | 'initial';
}
export interface ExpressionActions {
  select(id: string): void;
  edit(id: string, source: string, before?: EditorState): void;
  initial(id: string, value: string, before?: EditorState): void;
  breakHistoryGroup(): void;
  remove(id: string): void;
  duplicate(id: string): void;
  add(): void;
}

/** 1行の入力と操作ラベルを所有する。行順・選択の決定はモデルに任せる。 */
export class ExpressionRow {
  readonly element = document.createElement('div');
  readonly input = document.createElement('input');
  readonly editor = document.createElement('div');
  readonly initialInput = document.createElement('input');
  private readonly number = document.createElement('button');
  private readonly handle = document.createElement('button');
  private readonly preview = document.createElement('button');
  private readonly remove = document.createElement('button');
  private readonly duplicate = document.createElement('button');
  private readonly isRestoring: () => boolean;
  private readonly sourceCode: CodeEditor;
  private readonly initialCode: CodeEditor;
  private composing = false;
  private initialComposing = false;

  constructor(row: InputRow, actions: ExpressionActions, isRestoring: () => boolean) {
    this.isRestoring = isRestoring;
    this.element.className = 'expression-row';
    this.element.dataset.id = row.id;
    this.element.setAttribute('role', 'listitem');
    this.handle.className = 'drag-handle';
    this.handle.textContent = '⠿';
    this.handle.setAttribute('aria-describedby', 'row-controls-help');
    this.handle.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown Home End');
    this.handle.title = 'ドラッグで並べ替え（↑↓ / Home / End キーも使用可能）';
    this.number.className = 'row-number';
    this.number.onclick = () => actions.select(row.id);
    const body = document.createElement('div'); body.className = 'expression-content';
    this.input.value = row.source;
    this.input.type = 'text'; this.input.maxLength = MAX_EXPRESSION_LENGTH;
    this.input.spellcheck = false; this.input.autocomplete = 'off'; this.input.placeholder = '例: f = exp(x)';
    const reveal = () => requestAnimationFrame(() => revealInputCaret(this.input));
    let beforeEdit: EditorState | undefined;
    let beforeComposition: EditorState | undefined;
    let separateEdit = false;
    const finishComposition = () => {
      if (!this.composing) return;
      this.composing = false;
      actions.edit(row.id, this.input.value, beforeComposition);
      beforeComposition = undefined; beforeEdit = undefined;
      actions.breakHistoryGroup();
    };
    this.input.addEventListener('beforeinput', (event) => {
      if (this.composing || event.inputType === 'historyUndo' || event.inputType === 'historyRedo') return;
      separateEdit = ['insertFromPaste', 'insertFromDrop', 'insertReplacementText', 'deleteByCut'].includes(event.inputType);
      if (separateEdit) actions.breakHistoryGroup();
      beforeEdit = this.editorState();
    });
    this.input.addEventListener('blur', () => { finishComposition(); beforeEdit = undefined; actions.breakHistoryGroup(); });
    this.input.addEventListener('pointerdown', () => actions.breakHistoryGroup());
    this.input.addEventListener('compositionstart', () => {
      this.composing = true; beforeComposition = this.editorState(); actions.breakHistoryGroup();
    });
    this.input.addEventListener('compositionend', finishComposition);
    this.input.addEventListener('focus', () => {
      if (this.isRestoring()) return;
      actions.select(row.id); reveal();
    });
    this.input.addEventListener('input', () => {
      sizeExpressionInput(this.input); reveal();
      if (this.composing) return;
      actions.edit(row.id, this.input.value, beforeEdit); beforeEdit = undefined;
      if (separateEdit) { separateEdit = false; actions.breakHistoryGroup(); }
    });
    this.input.addEventListener('keydown', (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)
        || (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') actions.breakHistoryGroup();
      if (event.key === 'Enter') actions.add();
    });
    this.input.addEventListener('keyup', reveal);
    this.input.addEventListener('click', reveal);
    this.preview.className = 'row-preview'; this.preview.onclick = () => actions.select(row.id);
    this.editor.className = 'expression-editor'; this.editor.append(this.input);
    body.append(this.editor, this.preview);
    const initialDetails = document.createElement('details'); initialDetails.className = 'row-initial';
    const summary = document.createElement('summary'); summary.textContent = '再帰の初期値';
    const label = document.createElement('label'); label.textContent = '定数項 / 高階微分の初期係数（seq(a0,a1,…)）';
    this.initialInput.type = 'text'; this.initialInput.className = 'initial-input'; this.initialInput.placeholder = '例: 1 / seq(0,1)'; this.initialInput.maxLength = MAX_EXPRESSION_LENGTH; this.initialInput.spellcheck = false;
    let beforeInitial: EditorState | undefined;
    const commitInitial = () => { actions.initial(row.id, this.initialInput.value, beforeInitial); beforeInitial = undefined; };
    this.initialInput.onbeforeinput = (event) => { if (!this.initialComposing && !['historyUndo', 'historyRedo'].includes(event.inputType)) beforeInitial = this.editorState('initial'); };
    this.initialInput.oninput = () => { if (!this.initialComposing) commitInitial(); };
    this.initialInput.addEventListener('compositionstart', () => { this.initialComposing = true; beforeInitial = this.editorState('initial'); actions.breakHistoryGroup(); });
    const finishInitial = () => { if (this.initialComposing) { this.initialComposing = false; commitInitial(); actions.breakHistoryGroup(); } };
    this.initialInput.addEventListener('compositionend', finishInitial);
    this.initialInput.onfocus = () => { if (!this.isRestoring()) actions.select(row.id); };
    this.initialInput.onblur = () => { finishInitial(); actions.breakHistoryGroup(); };
    label.append(this.initialInput); initialDetails.append(summary, label); body.append(initialDetails);
    const controls = document.createElement('div'); controls.className = 'row-actions';
    this.duplicate.className = 'duplicate-row';
    this.duplicate.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1"/><path d="M10.5 3.5v-1h-8v8h1"/></svg>';
    this.duplicate.title = 'この式を複製'; this.duplicate.onclick = () => actions.duplicate(row.id);
    this.remove.className = 'remove-row'; this.remove.textContent = '×'; this.remove.onclick = () => actions.remove(row.id);
    controls.append(this.duplicate, this.remove);
    this.element.append(this.handle, this.number, body, controls);
    this.sourceCode = new CodeEditor(this.input, { mode: 'statement', wide: true, boundary: actions.breakHistoryGroup });
    this.initialCode = new CodeEditor(this.initialInput, { mode: 'scalar', boundary: actions.breakHistoryGroup });
  }
  editorState(field: 'source' | 'initial' = 'source'): EditorState {
    const input = field === 'source' ? this.input : this.initialInput;
    return { id: this.element.dataset.id!, field, start: input.selectionStart ?? 0, end: input.selectionEnd ?? 0, direction: input.selectionDirection ?? 'none', scrollLeft: field === 'source' ? this.editor.scrollLeft : input.scrollLeft };
  }
  update(row: InputRow, index: number, selected: boolean, canDuplicate: boolean): void {
    if (!this.composing && this.input.value !== row.source) { this.input.value = row.source; sizeExpressionInput(this.input); }
    this.element.classList.toggle('selected', selected);
    this.number.textContent = String(index + 1).padStart(2, '0');
    this.number.setAttribute('aria-label', `式 ${index + 1} の係数を表示`);
    this.input.setAttribute('aria-label', `式 ${index + 1}`);
    this.preview.setAttribute('aria-label', `式 ${index + 1} の計算結果を表示`);
    this.remove.setAttribute('aria-label', `式 ${index + 1} を削除`);
    this.duplicate.setAttribute('aria-label', `式 ${index + 1} を複製`);
    this.duplicate.disabled = !canDuplicate;
    if (!this.initialComposing && this.initialInput.value !== (row.initial ?? '')) {
      this.initialInput.value = row.initial ?? '';
      if (row.initial) this.initialInput.closest('details')!.open = true;
    }
    this.initialInput.setAttribute('aria-label', `式 ${index + 1} の定数項`);
    this.handle.setAttribute('aria-label', `式 ${index + 1} を並べ替え`);
    this.initialCode.refresh();
  }
  setNames(names: readonly string[]): void { this.sourceCode.setNames(names); this.initialCode.setNames(names); }
  destroy(): void { this.sourceCode.destroy(); this.initialCode.destroy(); }
  renderResult(result: RowResult | undefined, busy: boolean): void {
    this.sourceCode.setDiagnostic(busy ? undefined : result?.diagnostic);
    this.preview.textContent = rowPreview(result, busy);
    this.preview.classList.toggle('error', !busy && Boolean(result?.error));
  }
}
