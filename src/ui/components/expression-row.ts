import type { InputRow, RowResult } from '../../model/calculation.ts';
import { rowPreview } from '../result-format.ts';
import { RowComment } from './row-comment.ts';
import { RowSource } from './row-source.ts';
import { RowInitial } from './row-initial.ts';
import type { EditorState, ExpressionActions } from './expression-row-types.ts';
export type { EditorState, ExpressionActions } from './expression-row-types.ts';

/** 1行の入力と操作ラベルを所有する。行順・選択の決定はモデルに任せる。 */
export class ExpressionRow {
  readonly element = document.createElement('div');
  private readonly source: RowSource;
  private readonly initial: RowInitial;
  get input(): HTMLInputElement { return this.source.input; }
  get editor(): HTMLElement { return this.source.element; }
  get initialInput(): HTMLInputElement { return this.initial.input; }
  readonly comment: RowComment;
  private readonly number = document.createElement('button');
  private readonly handle = document.createElement('button');
  private readonly preview = document.createElement('button');
  private readonly remove = document.createElement('button');
  private readonly duplicate = document.createElement('button');
  constructor(row: InputRow, actions: ExpressionActions, isRestoring: () => boolean) {
    const body = document.createElement('div'); body.className = 'expression-content';
    this.source = new RowSource(body, row, actions, isRestoring);
    this.initial = new RowInitial(row, actions, isRestoring);
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
    this.preview.className = 'row-preview'; this.preview.onclick = () => actions.select(row.id);
    body.append(this.preview, this.initial.element);
    this.comment=new RowComment(row.id,actions,isRestoring);body.append(this.comment.element);
    const controls = document.createElement('div'); controls.className = 'row-actions';
    this.duplicate.className = 'duplicate-row';
    this.duplicate.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1"/><path d="M10.5 3.5v-1h-8v8h1"/></svg>';
    this.duplicate.title = 'この式を複製'; this.duplicate.onclick = () => actions.duplicate(row.id);
    this.remove.className = 'remove-row'; this.remove.textContent = '×'; this.remove.onclick = () => actions.remove(row.id);
    controls.append(this.duplicate, this.remove);
    this.element.append(this.handle, this.number, body, controls);
  }
  editorState(field: 'source' | 'initial' | 'comment' = 'source'): EditorState {
    return field === 'comment' ? this.comment.state() : field === 'initial' ? this.initial.state() : this.source.state();
  }
  update(row: InputRow, index: number, selected: boolean, canDuplicate: boolean): void {
    this.source.update(row.source, index);
    this.element.classList.toggle('selected', selected);
    this.number.textContent = String(index + 1).padStart(2, '0');
    this.number.setAttribute('aria-label', `式 ${index + 1} の係数を表示`);
    this.preview.setAttribute('aria-label', `式 ${index + 1} の計算結果を表示`);
    this.remove.setAttribute('aria-label', `式 ${index + 1} を削除`);
    this.duplicate.setAttribute('aria-label', `式 ${index + 1} を複製`);
    this.duplicate.disabled = !canDuplicate;
    this.initial.update(row.initial ?? '', index);
    this.comment.update(row.comment??'',index);
    this.handle.setAttribute('aria-label', `式 ${index + 1} を並べ替え`);
  }
  setNames(names: readonly string[]): void { this.source.setNames(names); this.initial.setNames(names); }
  destroy(): void { this.source.destroy(); this.initial.destroy(); }
  renderResult(result: RowResult | undefined, busy: boolean): void {
    this.source.setDiagnostic(busy ? undefined : result?.diagnostic);
    this.preview.textContent = rowPreview(result, busy);
    this.preview.classList.toggle('error', !busy && Boolean(result?.error));
  }
}
