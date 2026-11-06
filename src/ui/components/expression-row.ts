import { MAX_EXPRESSION_LENGTH } from '../../config/limits.ts';
import type { InputRow, RowResult } from '../../model/calculation.ts';
import { revealInputCaret, sizeExpressionInput } from '../interactions/input-scroll.ts';
import { rowPreview } from '../result-format.ts';

export interface ExpressionActions {
  select(id: string): void;
  edit(id: string, source: string): void;
  remove(id: string): void;
  add(): void;
}

/** 1行の入力と操作ラベルを所有する。行順・選択の決定はモデルに任せる。 */
export class ExpressionRow {
  readonly element = document.createElement('div');
  readonly input = document.createElement('input');
  readonly editor = document.createElement('div');
  private readonly number = document.createElement('button');
  private readonly handle = document.createElement('button');
  private readonly preview = document.createElement('button');
  private readonly remove = document.createElement('button');
  private readonly isRestoring: () => boolean;

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
    this.input.addEventListener('focus', () => {
      if (this.isRestoring()) return;
      actions.select(row.id); reveal();
    });
    this.input.addEventListener('input', () => {
      sizeExpressionInput(this.input); reveal(); actions.edit(row.id, this.input.value);
    });
    this.input.addEventListener('keydown', (event) => { if (event.key === 'Enter') actions.add(); });
    this.input.addEventListener('keyup', reveal);
    this.input.addEventListener('click', reveal);
    this.preview.className = 'row-preview'; this.preview.onclick = () => actions.select(row.id);
    this.editor.className = 'expression-editor'; this.editor.append(this.input);
    body.append(this.editor, this.preview);
    this.remove.className = 'remove-row'; this.remove.textContent = '×'; this.remove.onclick = () => actions.remove(row.id);
    this.element.append(this.handle, this.number, body, this.remove);
  }
  update(row: InputRow, index: number, selected: boolean): void {
    if (this.input.value !== row.source) { this.input.value = row.source; sizeExpressionInput(this.input); }
    this.element.classList.toggle('selected', selected);
    this.number.textContent = String(index + 1).padStart(2, '0');
    this.number.setAttribute('aria-label', `式 ${index + 1} の係数を表示`);
    this.input.setAttribute('aria-label', `式 ${index + 1}`);
    this.preview.setAttribute('aria-label', `式 ${index + 1} の計算結果を表示`);
    this.remove.setAttribute('aria-label', `式 ${index + 1} を削除`);
    this.handle.setAttribute('aria-label', `式 ${index + 1} を並べ替え`);
  }
  renderResult(result: RowResult | undefined, busy: boolean): void {
    this.preview.textContent = rowPreview(result, busy);
    this.preview.classList.toggle('error', !busy && Boolean(result?.error));
  }
}
