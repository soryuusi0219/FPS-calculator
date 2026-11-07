import { inputHelpMarkup } from './input-help.ts';
import { declaredNames } from '../../app/rename-variable.ts';
import { NotebookTools } from './notebook-tools.ts';
import type { NotebookToolActions } from './notebook-tools.ts';
import { MAX_ROWS, MAX_TERMS } from '../../config/limits.ts';
import type { Calculation, EquationSystemResult, RowResult } from '../../model/calculation.ts';
import { query } from '../dom.ts';
import type { EditorState, ExpressionActions } from './expression-row-types.ts';
import { ExpressionList } from './expression-list.ts';
import { EquationSystemsView } from './equation-systems-view.ts';
import type { SystemActions, SystemFocus } from './equation-systems-view.ts';

export interface NotebookActions extends ExpressionActions, SystemActions, NotebookToolActions {
  undo(): void;
  redo(): void;
  move(id: string, index: number): void;
  domain(value: Calculation['domain']): void;
  terms(value: number): void;
  modulus(value: string): void;
}

export type NotebookFocus = { kind: 'expression'; editor: EditorState | null }
  | { kind: 'setting'; id: 'domain' | 'terms' | 'modulus' }
  | { kind: 'system'; editor: SystemFocus };

export class NotebookView {
  readonly expandButton: HTMLButtonElement;
  private readonly list: ExpressionList;
  private readonly domain: HTMLSelectElement;
  private readonly terms: HTMLInputElement;
  private readonly modulus: HTMLInputElement;
  private readonly modulusLabel: HTMLElement;
  private readonly addButtons: HTMLButtonElement[];
  private readonly storageNote: HTMLElement;
  private readonly feedback: HTMLElement;
  private readonly undoButton: HTMLButtonElement;
  private readonly redoButton: HTMLButtonElement;
  private readonly tools: NotebookTools;
  private readonly systems: EquationSystemsView;

  constructor(host: HTMLElement, actions: NotebookActions) {
    host.innerHTML = `
      <div class="notebook-heading"><div><p class="eyebrow">EXPRESSION NOTEBOOK</p><h1>計算ノート</h1></div><button id="add-top" class="icon-button" aria-label="式を追加">＋</button></div>
      <div class="history-tools" role="group" aria-label="編集履歴">
        <button id="undo" class="secondary-button" disabled title="元に戻す（Ctrl / ⌘ + Z）" aria-keyshortcuts="Control+Z Meta+Z">元に戻す</button>
        <button id="redo" class="secondary-button" disabled title="やり直す（Ctrl / ⌘ + Shift + Z、Ctrl + Y）" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y Meta+Y">やり直す</button>
      </div>
      <div class="notebook-tools"><button id="expand-notebook" class="secondary-button" aria-pressed="false" aria-controls="notebook">入力欄を広げる</button></div>
      <div id="notebook-documents"></div>
      <div class="settings">
        <label>係数体<select id="domain"><option value="rational">ℚ 有理数</option><option value="prime">𝔽p 素数 mod</option></select></label>
        <label>打ち切り次数 N<input id="terms" type="number" min="1" max="${MAX_TERMS}" step="1" /></label>
        <label class="modulus-label" id="modulus-label" hidden>素数 p<input id="modulus" type="text" inputmode="numeric" maxlength="10" aria-label="法となる素数" /></label>
      </div>
      <p class="precision-note">xᴺ 未満を表示 · Laurent級数は負の次数も含む</p>
      <p id="row-controls-help" class="notebook-hint">取っ手で行を並べ替え · 長い式は横スクロール<br>取っ手にフォーカスして ↑↓ / Home / End でも移動 · ⧉ で複製</p>
      <p id="notebook-feedback" class="sr-only" role="status" aria-live="polite"></p>
      <div id="expressions" class="expressions" role="list" aria-label="数式一覧"></div>
      <button id="add" class="add-expression">＋ 式を追加</button>
      <div id="equation-systems" class="equation-systems"></div>
      ${inputHelpMarkup}
      <p id="storage-note" class="storage-note"></p>
    `;
    this.tools = new NotebookTools(query(host, '#notebook-documents'), actions);
    this.domain = query(host, '#domain');
    this.terms = query(host, '#terms');
    this.modulus = query(host, '#modulus');
    this.modulusLabel = query(host, '#modulus-label');
    this.expandButton = query(host, '#expand-notebook');
    this.storageNote = query(host, '#storage-note');
    this.feedback = query(host, '#notebook-feedback');
    this.undoButton = query(host, '#undo');
    this.redoButton = query(host, '#redo');
    this.undoButton.onclick = actions.undo;
    this.redoButton.onclick = actions.redo;
    this.addButtons = [query(host, '#add'), query(host, '#add-top')];
    this.list = new ExpressionList(query(host, '#expressions'), actions);
    this.systems = new EquationSystemsView(query(host, '#equation-systems'), actions);
    this.addButtons.forEach((button) => { button.onclick = () => actions.add(); });
    this.domain.onchange = () => actions.domain(this.domain.value as Calculation['domain']);
    this.terms.oninput = () => actions.terms(this.terms.valueAsNumber);
    this.modulus.oninput = () => actions.modulus(this.modulus.value);
    for (const control of [this.domain, this.terms, this.modulus]) control.addEventListener('blur', actions.breakHistoryGroup);
  }
  render(input: Calculation, selectedId: string, results: ReadonlyMap<string, RowResult>, busy: boolean, systems: readonly EquationSystemResult[] = []): void {
    if (this.domain.value !== input.domain) this.domain.value = input.domain;
    if (!Object.is(this.terms.valueAsNumber, input.terms)) this.terms.value = Number.isNaN(input.terms) ? '' : String(input.terms);
    if (this.modulus.value !== input.modulus) this.modulus.value = input.modulus;
    this.modulusLabel.hidden = input.domain !== 'prime';
    this.addButtons.forEach((button) => { button.disabled = input.rows.length >= MAX_ROWS; });
    const names = declaredNames(input);
    this.tools.renderNames(names);
    this.list.render(input.rows, selectedId, results, busy, names);
    this.systems.render(input.systems ?? [], systems, busy, names);
  }
  focus(id: string): void { this.list.focus(id); }
  renderHistory(canUndo: boolean, canRedo: boolean): void {
    this.undoButton.disabled = !canUndo;
    this.redoButton.disabled = !canRedo;
  }
  captureFocus(fallbackId: string): NotebookFocus {
    const system = this.systems.captureFocus();
    if (system) return { kind: 'system', editor: system };
    for (const id of ['domain', 'terms', 'modulus'] as const) {
      if (document.activeElement === this[id]) return { kind: 'setting', id };
    }
    return { kind: 'expression', editor: this.list.captureEditor(fallbackId) };
  }
  restoreFocus(focus: NotebookFocus): void {
    if (focus.kind === 'setting') this[focus.id].focus({ preventScroll: true });
    else if (focus.kind === 'system') this.systems.restoreFocus(focus.editor);
    else if (focus.editor) this.list.restoreEditor(focus.editor);
  }
  announceHistory(redo: boolean): void { this.feedback.textContent = redo ? '操作をやり直しました。' : '操作を元に戻しました。'; }
  focusSystem(id: string): void { this.systems.focus(id); }
  announceMove(index: number): void { this.feedback.textContent = `式を ${index + 1} 行目に移動しました。`; }
  showDocumentStatus(message: string, error = false): void { this.tools.show(message, error); }
  showStorage(available: boolean): void {
    this.storageNote.textContent = available ? 'このブラウザに自動保存されます。' : 'ブラウザ保存を利用できません。このタブ内で計算できます。';
  }
}
