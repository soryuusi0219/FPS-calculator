import { MAX_EXPRESSION_LENGTH } from '../../config/limits.ts';
import type { Diagnostic } from '../../language/source.ts';
import type { InputRow } from '../../model/calculation.ts';
import { revealInputCaret, sizeExpressionInput } from '../interactions/input-scroll.ts';
import { captureEditorState } from '../interactions/editor-state.ts';
import { CodeEditor } from '../interactions/code-editor.ts';
import type { EditorState, ExpressionActions } from './expression-row-types.ts';

/** 数式入力のIME・編集境界・横スクロール・構文支援を所有する。 */
export class RowSource {
  readonly input = document.createElement('input');
  readonly element = document.createElement('div');
  private readonly code: CodeEditor;
  private readonly id: string;
  private readonly isRestoring: () => boolean;
  private composing = false;

  constructor(host: HTMLElement, row: InputRow, actions: Pick<ExpressionActions, 'edit' | 'select' | 'add' | 'breakHistoryGroup'>, isRestoring: () => boolean) {
    this.id = row.id; this.isRestoring = isRestoring;
    this.element.className = 'expression-editor'; this.element.append(this.input); host.append(this.element);
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
      beforeEdit = this.state();
    });
    this.input.addEventListener('blur', () => { finishComposition(); beforeEdit = undefined; actions.breakHistoryGroup(); });
    this.input.addEventListener('pointerdown', () => actions.breakHistoryGroup());
    this.input.addEventListener('compositionstart', () => {
      this.composing = true; beforeComposition = this.state(); actions.breakHistoryGroup();
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
    this.code = new CodeEditor(this.input, { mode: 'statement', wide: true, boundary: actions.breakHistoryGroup });
  }
  state(): EditorState { return captureEditorState(this.id, this.input, 'source', this.element); }
  update(value: string, index: number): void {
    if (!this.composing && this.input.value !== value) { this.input.value = value; sizeExpressionInput(this.input); }
    this.input.setAttribute('aria-label', `式 ${index + 1}`);
  }
  setNames(names: readonly string[]): void { this.code.setNames(names); }
  setDiagnostic(diagnostic?: Diagnostic): void { this.code.setDiagnostic(diagnostic); }
  destroy(): void { this.code.destroy(); }
}
