import { MAX_EXPRESSION_LENGTH } from '../../config/limits.ts';
import type { Calculation, RowResult } from '../../model/calculation.ts';
import { isSeriesResult } from '../../model/calculation.ts';
import type { Presentation } from '../../app/session.ts';
import { renderMath } from '../math.ts';
import { valueLabels } from '../result-format.ts';
import { coefficientTable } from './coefficient-table.ts';

interface ResultBodyProps {
  input: Calculation;
  result: RowResult | undefined;
  busy: boolean;
  error: string | undefined;
  presentation: Presentation;
}

/** 結果本体の描画。ツールバー・選択状態・計算要求はInspector側へ残す。 */
export class ResultBodyView {
  private readonly host: HTMLElement;
  private readonly add: (source: string) => void;
  constructor(host: HTMLElement, add: (source: string) => void) { this.host = host; this.add = add; }
  render({ input, result, busy, error: calculationError, presentation }: ResultBodyProps): void {
    const body = this.host;
    const error = calculationError ?? result?.error;
    if (busy || error || (!result?.coefficients && result?.value === undefined)) {
      const notice = document.createElement('div');
      notice.className = `result-notice${error && !busy ? ' error' : ''}`;
      notice.textContent = busy ? '係数を計算しています…' : error ?? '計算したい式を入力すると、ここに係数が表示されます。';
      body.replaceChildren(notice);
    } else if (result?.analysis) {
      const output = document.createElement('section');
      output.className = 'analysis-output';
      const heading = document.createElement('h3');
      heading.textContent = result.analysis.title;
      output.append(heading);
      if (result.resultTex) {
        const math = document.createElement('div');
        math.className = 'analysis-math';
        renderMath(result.resultTex, math);
        output.append(math);
      }
      for (const line of result.analysis.lines) {
        const paragraph = document.createElement('p');
        paragraph.textContent = line;
        output.append(paragraph);
      }
      if (result.analysis.expression && !result.analysis.expression.includes(' = ')) {
        const add = document.createElement('button');
        add.className = 'secondary-button';
        add.textContent = '復元した有理式をノートに追加';
        add.disabled = result.analysis.expression.length > MAX_EXPRESSION_LENGTH;
        add.onclick = () => this.add(result.analysis!.expression!);
        output.append(add);
      }
      body.replaceChildren(output);
    } else if (isSeriesResult(result) && presentation === 'table') {
      body.replaceChildren(coefficientTable(result, input));
    } else {
      const output = document.createElement('div');
      output.className = isSeriesResult(result) ? 'series-output' : 'scalar-output';
      output.setAttribute('aria-label', isSeriesResult(result) ? '横向きの級数表示' : result.valueType ? valueLabels[result.valueType] : '計算結果');
      renderMath(result.resultTex ?? '', output);
      body.replaceChildren(output);
    }
  }
}
