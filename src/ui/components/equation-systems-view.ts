import { MAX_EQUATION_GROUPS, MAX_SYSTEM_TEXT_LENGTH } from '../../config/limits.ts';
import type { EquationSystemInput, EquationSystemResult } from '../../model/calculation.ts';
import { CodeEditor } from '../interactions/code-editor.ts';
import { rowPreview } from '../result-format.ts';

export interface SystemFocus { id: string; field: 'variables' | 'equations'; start: number; end: number; direction: 'forward' | 'backward' | 'none'; scrollTop: number }
export interface SystemActions {
  addSystem(): void; removeSystem(id: string): void;
  editSystem(id: string, field: 'variables' | 'equations', value: string, before?: SystemFocus): void;
  systemMethod(id: string, value: EquationSystemInput['method']): void;
  inspectSystem(name: string): void; breakHistoryGroup(): void;
}
interface Block { element: HTMLElement; variables: HTMLTextAreaElement; equations: HTMLTextAreaElement; method: HTMLSelectElement; result: HTMLElement; composing: Set<string>; editors: CodeEditor[] }

/** グループ単位でDOMを保持し、方程式や初期値を文字列として編集する。 */
export class EquationSystemsView {
  private readonly blocks = new Map<string, Block>();
  private readonly list = document.createElement('div');
  private readonly add = document.createElement('button');
  private readonly actions: SystemActions;
  constructor(host: HTMLElement, actions: SystemActions) {
    this.actions = actions;
    host.innerHTML = '<h2>連立方程式</h2><p>未知数は u = 1 のように定数項を指定するか、u のように名前だけを入力します。高階微分の初期係数は u = seq(0,1) のように指定できます。方程式も1行に1本入力してください。diff(u)=u や積分にも対応します。微積分系の解法は係数逐次法です。結果をクリックするとノートで確認できます。</p>';
    this.add.className = 'add-expression'; this.add.textContent = '＋ 方程式グループを追加'; this.add.onclick = actions.addSystem;
    host.append(this.list, this.add);
  }
  private state(id: string, field: SystemFocus['field']): SystemFocus {
    const input = this.blocks.get(id)![field];
    return { id, field, start: input.selectionStart, end: input.selectionEnd, direction: input.selectionDirection, scrollTop: input.scrollTop };
  }
  captureFocus(): SystemFocus | undefined {
    for (const [id, block] of this.blocks) for (const field of ['variables', 'equations'] as const) if (document.activeElement === block[field]) return this.state(id, field);
    return;
  }
  restoreFocus(state: SystemFocus): void {
    const input = this.blocks.get(state.id)?.[state.field];
    if (!input) return;
    input.focus({ preventScroll: true }); input.setSelectionRange(state.start, state.end, state.direction); input.scrollTop = state.scrollTop;
    input.scrollIntoView({ block: 'nearest' });
  }
  focus(id: string): void { this.blocks.get(id)?.variables.focus(); }
  render(inputs: readonly EquationSystemInput[], results: readonly EquationSystemResult[], busy: boolean, names: readonly string[] = []): void {
    const ids = new Set(inputs.map((input) => input.id));
    for (const [id, block] of this.blocks) if (!ids.has(id)) { block.editors.forEach(editor => editor.destroy()); block.element.remove(); this.blocks.delete(id); }
    inputs.forEach((input, index) => {
      let block = this.blocks.get(input.id);
      if (!block) {
        const element = document.createElement('section'); element.className = 'equation-system'; element.dataset.id = input.id;
        const heading = document.createElement('div'); heading.className = 'equation-system-heading';
        const title = document.createElement('strong'); title.textContent = '方程式グループ';
        const remove = document.createElement('button'); remove.textContent = '削除'; remove.className = 'secondary-button'; remove.onclick = () => this.actions.removeSystem(input.id);
        heading.append(title, remove);
        const variables = document.createElement('textarea'); const equations = document.createElement('textarea');
        const method = document.createElement('select');
        method.innerHTML = '<option value="auto">自動</option><option value="coefficient">係数を次数順に求める</option><option value="newton">Newton法</option>';
        method.onchange = () => this.actions.systemMethod(input.id, method.value as EquationSystemInput['method']);
        const result = document.createElement('div'); result.className = 'equation-system-result'; result.setAttribute('aria-live', 'polite');
        block = { element, variables, equations, method, result, composing: new Set(), editors: [] }; this.blocks.set(input.id, block);
        element.append(heading);
        for (const field of ['variables', 'equations'] as const) {
          const textarea = block[field]; textarea.maxLength = MAX_SYSTEM_TEXT_LENGTH; textarea.spellcheck = false; textarea.rows = field === 'variables' ? 2 : 3;
          textarea.placeholder = field === 'variables' ? 'u = 1\nv = 1' : 'u = 1+x*v\nv = 1+x*u*v';
          const label = document.createElement('label'); label.textContent = field === 'variables' ? '未知数と定数項（空欄は自動推定）' : '方程式'; label.append(textarea); element.append(label);
          let before: SystemFocus | undefined;
          let separate = false;
          const commit = () => { this.actions.editSystem(input.id, field, textarea.value, before); before = undefined; };
          textarea.addEventListener('beforeinput', (event) => {
            if (block!.composing.has(field) || event.inputType === 'historyUndo' || event.inputType === 'historyRedo') return;
            before = this.state(input.id, field);
            separate = ['insertFromPaste', 'deleteByCut'].includes(event.inputType);
            if (separate) this.actions.breakHistoryGroup();
          });
          textarea.oninput = () => { if (!block!.composing.has(field)) { commit(); if (separate) { separate = false; this.actions.breakHistoryGroup(); } } };
          textarea.addEventListener('compositionstart', () => { before = this.state(input.id, field); block!.composing.add(field); this.actions.breakHistoryGroup(); });
          const finish = () => { if (block!.composing.delete(field)) { commit(); this.actions.breakHistoryGroup(); } };
          textarea.addEventListener('compositionend', finish);
          textarea.onblur = () => { finish(); this.actions.breakHistoryGroup(); };
          textarea.onpointerdown = () => this.actions.breakHistoryGroup();
          block.editors.push(new CodeEditor(textarea, { mode: field, boundary: this.actions.breakHistoryGroup }));
          textarea.onkeydown = (event) => { if (!event.isComposing && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) this.actions.breakHistoryGroup(); };
        }
        const methodLabel = document.createElement('label'); methodLabel.textContent = '解法'; methodLabel.append(method); element.append(methodLabel, result);
      }
      if (this.list.children[index] !== block.element) this.list.insertBefore(block.element, this.list.children[index] ?? null);
      for (const field of ['variables', 'equations'] as const) {
        block[field].setAttribute('aria-label', `連立 ${index + 1} の${field === 'variables' ? '未知数と定数項' : '方程式'}`);
        if (!block.composing.has(field) && block[field].value !== input[field]) block[field].value = input[field];
      }
      block.editors.forEach(editor => { editor.setNames(names); editor.refresh(); });
      block.method.setAttribute('aria-label', `連立 ${index + 1} の解法`); block.method.value = input.method;
      block.element.querySelector('button')!.setAttribute('aria-label', `連立 ${index + 1} を削除`);
      const result = results.find((result) => result.id === input.id);
      block.result.replaceChildren();
      if (busy || result?.error) { block.result.textContent = busy ? '計算中…' : result!.error!; block.result.classList.toggle('error', !busy); }
      else {
        block.result.classList.remove('error');
        for (const solution of result?.solutions ?? []) {
          const button = document.createElement('button'); button.className = 'system-solution';
          button.textContent = `${solution.name}: ${rowPreview(solution, false)}`;
          button.onclick = () => this.actions.inspectSystem(solution.name!); block.result.append(button);
        }
      }
    });
    this.add.disabled = inputs.length >= MAX_EQUATION_GROUPS;
  }
}
