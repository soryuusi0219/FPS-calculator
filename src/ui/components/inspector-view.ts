import type { CalculationSnapshot } from '../../app/calculation-client.ts';
import type { Presentation } from '../../app/session.ts';
import type { Calculation, InputRow, RowResult } from '../../model/calculation.ts';
import { isSeriesResult } from '../../model/calculation.ts';
import { query } from '../dom.ts';
import { renderMath } from '../math.ts';
import { bindCopyButton } from '../clipboard.ts';
import { basisNote, resultCopyText, texCopyText, valueLabels } from '../result-format.ts';
import { ResultBodyView } from './result-body-view.ts';

export interface InspectorProps {
  input: Calculation;
  selectedRow: InputRow;
  result: RowResult | undefined;
  calculation: CalculationSnapshot;
  presentation: Presentation;
}
interface InspectorActions {
  basis(value: Calculation['basis']): void;
  presentation(value: Presentation): void;
  add(source: string): void;
}

export class InspectorView {
  private readonly host: HTMLElement;
  private readonly body: ResultBodyView;
  private props: InspectorProps | undefined;
  private readonly copy: HTMLButtonElement;
  private readonly copyTex: HTMLButtonElement;

  constructor(host: HTMLElement, actions: InspectorActions) {
    this.host = host;
    host.innerHTML = `
      <div class="inspector-top"><p class="eyebrow">COEFFICIENT EXPLORER</p><span id="status" role="status" class="status"></span></div>
      <div class="result-heading"><div><h2 id="result-heading">計算結果 <span id="value-type" class="value-type"></span></h2><p id="result-subtitle"></p></div><div class="copy-actions"><button id="copy-tex" class="secondary-button">TeXをコピー</button><button id="copy" class="secondary-button">係数をコピー</button></div></div>
      <div id="expression-math" class="expression-math" aria-label="入力式の数式表示"></div>
      <div class="result-card">
        <div class="result-toolbar"><div class="basis-toggle" role="group" aria-label="係数表示の基底"><button id="ogf">O.G.F.</button><button id="egf">E.G.F.</button></div><div class="basis-toggle" role="group" aria-label="結果の表示形式"><button id="view-table">係数表</button><button id="view-series">級数</button></div><span id="basis-description"></span></div>
        <div id="result-body"></div>
      </div>
      <details class="tex-source"><summary>TeXソース</summary><pre id="tex-source"></pre></details>
      <div class="reference-note"><span class="note-icon">i</span><p id="basis-note"></p></div>
      <section class="recipes" aria-label="式のサンプル"><p class="eyebrow">TRY AN EXPRESSION</p><div><button data-example="sqrt(1+x)"><span>平方根</span><code>sqrt(1+x)</code></button><button data-example="fps(n =&gt; nCk(2*n,n))"><span>ラムダでFPSを宣言</span><code>fps(n =&gt; nCk(2*n,n))</code></button><button data-example="map(1/(1-x), (a,i) =&gt; (i+1)!*a^2)"><span>階乗と係数写像</span><code>map(f, (a,i) =&gt; (i+1)!*a^2)</code></button></div></section>
      <footer>厳密計算 · ブラウザ内で実行 <span>ℚ[[x]] / 𝔽p[[x]]</span></footer>
    `;
    this.body = new ResultBodyView(query(host, '#result-body'), actions.add);
    this.copy = query(host, '#copy');
    this.copyTex = query(host, '#copy-tex');
    for (const basis of ['ogf', 'egf'] as const) query<HTMLButtonElement>(host, `#${basis}`).onclick = () => actions.basis(basis);
    for (const view of ['table', 'series'] as const) query<HTMLButtonElement>(host, `#view-${view}`).onclick = () => actions.presentation(view);
    host.querySelectorAll<HTMLButtonElement>('[data-example]').forEach((button) => { button.onclick = () => actions.add(button.dataset.example!); });
    bindCopyButton(this.copy, () => resultCopyText(this.props?.result), () => this.copyLabel());
    bindCopyButton(this.copyTex, () => texCopyText(this.props?.result), () => 'TeXをコピー');
  }
  private copyLabel(): string { return isSeriesResult(this.props?.result) ? '係数をコピー' : '値をコピー'; }
  render(props: InspectorProps): void {
    this.props = props;
    const { input, result, selectedRow, presentation, calculation } = props;
    const { busy, error, rows } = calculation;
    const element = <T extends Element = HTMLElement>(id: string) => query<T>(this.host, `#${id}`);
    element('result-subtitle').textContent = selectedRow.source || '左のノートに計算式を入力してください';
    element('value-type').textContent = !busy && result?.valueType ? valueLabels[result.valueType] : '';
    const math = element('expression-math');
    if (!busy && result?.tex) renderMath(result.tex, math); else math.replaceChildren();
    element('tex-source').textContent = !busy ? texCopyText(result) ?? '' : '';
    const hasError = Boolean(error) || [...rows.values()].some((row) => Boolean(row.error));
    element('status').textContent = busy ? '計算中…' : hasError ? '入力を確認してください' : '計算完了';
    element('status').classList.toggle('has-error', hasError);
    for (const basis of ['ogf', 'egf'] as const) {
      element(basis).classList.toggle('active', input.basis === basis);
      element(basis).setAttribute('aria-pressed', String(input.basis === basis));
    }
    for (const view of ['table', 'series'] as const) {
      element(`view-${view}`).classList.toggle('active', presentation === view);
      element(`view-${view}`).setAttribute('aria-pressed', String(presentation === view));
      element<HTMLButtonElement>(`view-${view}`).disabled = !isSeriesResult(result);
    }
    element('basis-description').textContent = input.basis === 'ogf' ? 'f(x) = Σ cₙ xⁿ' : 'f(x) = Σ aₙ xⁿ/n!';
    element('basis-note').textContent = basisNote(input, result);
    this.copy.disabled = busy || Boolean(error) || resultCopyText(result) === undefined;
    this.copy.textContent = this.copyLabel();
    this.copyTex.disabled = busy || !result?.tex;
    this.body.render({ input, result, busy, error, presentation });
  }
}
