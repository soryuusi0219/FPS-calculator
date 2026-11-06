import { MAX_ROWS, MAX_TERMS } from '../../config/limits.ts';
import type { Calculation, RowResult } from '../../model/calculation.ts';
import { query } from '../dom.ts';
import type { ExpressionActions } from './expression-row.ts';
import { ExpressionList } from './expression-list.ts';

export interface NotebookActions extends ExpressionActions {
  move(id: string, index: number): void;
  domain(value: Calculation['domain']): void;
  terms(value: number): void;
  modulus(value: string): void;
}

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

  constructor(host: HTMLElement, actions: NotebookActions) {
    host.innerHTML = `
      <div class="notebook-heading"><div><p class="eyebrow">EXPRESSION NOTEBOOK</p><h1>計算ノート</h1></div><button id="add-top" class="icon-button" aria-label="式を追加">＋</button></div>
      <div class="notebook-tools"><button id="expand-notebook" class="secondary-button" aria-pressed="false" aria-controls="notebook">入力欄を広げる</button></div>
      <div class="settings">
        <label>係数体<select id="domain"><option value="rational">ℚ 有理数</option><option value="prime">𝔽p 素数 mod</option></select></label>
        <label>打ち切り次数 N<input id="terms" type="number" min="1" max="${MAX_TERMS}" step="1" /></label>
        <label class="modulus-label" id="modulus-label" hidden>素数 p<input id="modulus" type="text" inputmode="numeric" maxlength="10" aria-label="法となる素数" /></label>
      </div>
      <p class="precision-note">xᴺ 未満を表示 · Laurent級数は負の次数も含む</p>
      <p id="row-controls-help" class="notebook-hint">取っ手で行を並べ替え · 長い式は横スクロール<br>取っ手にフォーカスして ↑↓ / Home / End でも移動</p>
      <p id="notebook-feedback" class="sr-only" role="status" aria-live="polite"></p>
      <div id="expressions" class="expressions" role="list" aria-label="数式一覧"></div>
      <button id="add" class="add-expression">＋ 式を追加</button>
      <details class="syntax-help"><summary>入力のヒント</summary><div>
        <p><code>f = 1/(1-x)</code> と定義し、別の行から <code>f</code> を参照できます。乗算は <code>*</code>、べき乗は <code>^</code> です。</p>
        <dl><dt>sqrt(f) / f^(1/3) / f^g</dt><dd>厳密な平方根、有理数乗、定数項1のFPS乗</dd><dt>n! / C(n,k) / P(n,k) / H(n,k)</dt><dd>階乗・二項係数・順列・重複組合せ。5C2 も使用可能</dd><dt>stirling1(n,k) / stirling2(n,k)</dt><dd>第1種（符号なし）/ 第2種スターリング数</dd><dt>f[k] / coeff(f,k)</dt><dd>通常係数 [x^k]f をスカラーとして抽出</dd><dt>fps(n =&gt; 1/n!)</dt><dd>次数から係数を計算してFPSを生成</dd><dt>map(f,(a,i) =&gt; (i+1)!*a^2)</dt><dd>係数と添字にラムダ式を適用。a[i+1] で隣接係数も参照可能</dd><dt>fps(n =&gt; n%2==0 ? 1 : 0)</dt><dd>次数で条件分岐。if(条件,真,偽) も使用可能</dd><dt>exp(f) / log(f)</dt><dd>定数項はそれぞれ 0 / 1</dd><dt>inv(f) / revert(f)</dt><dd>乗法逆元 / 合成逆関数</dd><dt>compose(f,g) / diff(f) / integral(f)</dt><dd>合成 / 微分 / 定数項0の積分</dd></dl>
        <p><code>1/x</code>、<code>inv(x-x^2)</code>、<code>x^-2</code> はLaurent級数として計算できます。<code>f[-1]</code> で負の次数の係数も抽出できます。Laurent級数はO.G.F.表示に対応します。</p>
        <p>現在は単変数・非循環の式に対応。有限体で exp・log・積分などを使う場合、必要な整数の逆元が存在する必要があります。</p>
      </div></details>
      <p id="storage-note" class="storage-note"></p>
    `;
    this.domain = query(host, '#domain');
    this.terms = query(host, '#terms');
    this.modulus = query(host, '#modulus');
    this.modulusLabel = query(host, '#modulus-label');
    this.expandButton = query(host, '#expand-notebook');
    this.storageNote = query(host, '#storage-note');
    this.feedback = query(host, '#notebook-feedback');
    this.addButtons = [query(host, '#add'), query(host, '#add-top')];
    this.list = new ExpressionList(query(host, '#expressions'), actions);
    this.addButtons.forEach((button) => { button.onclick = () => actions.add(); });
    this.domain.onchange = () => actions.domain(this.domain.value as Calculation['domain']);
    this.terms.oninput = () => actions.terms(this.terms.valueAsNumber);
    this.modulus.oninput = () => actions.modulus(this.modulus.value);
  }
  render(input: Calculation, selectedId: string, results: ReadonlyMap<string, RowResult>, busy: boolean): void {
    if (this.domain.value !== input.domain) this.domain.value = input.domain;
    if (!Object.is(this.terms.valueAsNumber, input.terms)) this.terms.value = String(input.terms);
    if (this.modulus.value !== input.modulus) this.modulus.value = input.modulus;
    this.modulusLabel.hidden = input.domain !== 'prime';
    this.addButtons.forEach((button) => { button.disabled = input.rows.length >= MAX_ROWS; });
    this.list.render(input.rows, selectedId, results, busy);
  }
  focus(id: string): void { this.list.focus(id); }
  announceMove(index: number): void { this.feedback.textContent = `式を ${index + 1} 行目に移動しました。`; }
  showStorage(available: boolean): void {
    this.storageNote.textContent = available ? 'このブラウザに自動保存されます。' : 'ブラウザ保存を利用できません。このタブ内で計算できます。';
  }
}
