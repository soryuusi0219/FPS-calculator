import { MAX_EXPRESSION_LENGTH } from '../../config/limits.ts';
import { captureEditorState } from '../interactions/editor-state.ts';
import { CodeEditor } from '../interactions/code-editor.ts';
import type { EditorState, ExpressionActions } from './expression-row-types.ts';

/** 初期係数欄の開閉・IME・編集境界と構文支援を所有する。 */
export class RowInitial {
  readonly element = document.createElement('details');
  readonly input = document.createElement('input');
  private readonly code: CodeEditor;
  private readonly id: string;
  private readonly isRestoring: () => boolean;
  private composing = false;

  constructor(row: { id: string }, actions: Pick<ExpressionActions, 'initial' | 'select' | 'breakHistoryGroup'>, isRestoring: () => boolean) {
    this.id = row.id; this.isRestoring = isRestoring;
    const initialDetails = this.element; initialDetails.className = 'row-initial';
    const summary = document.createElement('summary'); summary.textContent = '再帰の初期値';
    const label = document.createElement('label'); label.textContent = '定数項 / 高階微分の初期係数（seq(a0,a1,…)）';
    this.input.type = 'text'; this.input.className = 'initial-input'; this.input.placeholder = '例: 1 / seq(0,1)'; this.input.maxLength = MAX_EXPRESSION_LENGTH; this.input.spellcheck = false;
    let beforeInitial: EditorState | undefined;
    const commitInitial = () => { actions.initial(row.id, this.input.value, beforeInitial); beforeInitial = undefined; };
    this.input.onbeforeinput = (event) => { if (!this.composing && !['historyUndo', 'historyRedo'].includes(event.inputType)) beforeInitial = this.state(); };
    this.input.oninput = () => { if (!this.composing) commitInitial(); };
    this.input.addEventListener('compositionstart', () => { this.composing = true; beforeInitial = this.state(); actions.breakHistoryGroup(); });
    const finishInitial = () => { if (this.composing) { this.composing = false; commitInitial(); actions.breakHistoryGroup(); } };
    this.input.addEventListener('compositionend', finishInitial);
    this.input.onfocus = () => { if (!this.isRestoring()) actions.select(row.id); };
    this.input.onblur = () => { finishInitial(); actions.breakHistoryGroup(); };
    label.append(this.input); initialDetails.append(summary, label);
    this.code = new CodeEditor(this.input, { mode: 'scalar', boundary: actions.breakHistoryGroup });
  }
  state(): EditorState { return captureEditorState(this.id, this.input, 'initial'); }
  update(value: string, index: number): void {
    if (!this.composing && this.input.value !== value) {
      this.input.value = value;
      if (value) this.element.open = true;
    }
    this.input.setAttribute('aria-label', `式 ${index + 1} の定数項`);
    this.code.refresh();
  }
  setNames(names: readonly string[]): void { this.code.setNames(names); }
  destroy(): void { this.code.destroy(); }
}
