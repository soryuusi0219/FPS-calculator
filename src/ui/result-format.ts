import type { Calculation, RowResult } from '../model/calculation.ts';
import { isSeriesResult } from '../model/calculation.ts';

export const valueLabels = { scalar: 'スカラー', fps: 'FPS', laurent: 'Laurent級数', analysis: '解析', lambda: 'ラムダ', boolean: '真偽値' };
export const solverLabels: Record<string, string> = { 'differential-coefficient': '微積分・係数逐次法', 'fixed-point': '再帰', coefficient: '係数逐次法', newton: 'Newton法' };

export function rowPreview(result: RowResult | undefined, busy: boolean): string {
  if (busy) return '計算中…';
  if (result?.error) return result.error;
  if (result?.analysis) return result.analysis.title;
  if (isSeriesResult(result)) {
    const label = result.valueType === 'laurent' ? `Laurent (次数${result.startDegree}〜)` : 'FPS';
    return `${label} [${result.coefficients.slice(0, 5).join(', ')}${result.coefficients.length > 5 ? ', …' : ''}]${result.solver ? ` · ${solverLabels[result.solver.method] ?? result.solver.method}` : ''}`;
  }
  if (result?.value !== undefined) return `${result.valueType === 'scalar' ? 'スカラー: ' : ''}${result.value}`;
  return '式を入力してください';
}

export function resultCopyText(result?: RowResult): string | undefined {
  if (!isSeriesResult(result)) return result?.value;
  return result.valueType === 'laurent'
    ? JSON.stringify({ startDegree: result.startDegree, coefficients: result.coefficients })
    : `[${result.coefficients.join(', ')}]`;
}
export function texCopyText(result?: RowResult): string | undefined {
  if (!result?.tex) return;
  return `${result.tex}${result.resultTex ? `\n\n${result.resultTex}` : ''}`;
}
export function basisNote(input: Calculation, result?: RowResult): string {
  if (result?.valueType === 'laurent') return `Laurent級数の次数 ${result.startDegree} から ${input.terms - 1} までを表示します。負の次数も通常係数として扱い、E.G.F.表示は未対応です。`;
  if (result?.valueType && !isSeriesResult(result)) return 'スカラー・真偽値・ラムダはFPSと区別して表示します。O.G.F./E.G.F. 切り替えの影響は受けません。';
  return input.basis === 'ogf'
    ? 'O.G.F. 表示では通常の係数 cₙ = [xⁿ]f を表示します。式は常に通常の冪級数として評価されます。'
    : 'E.G.F. 表示では aₙ = n! · [xⁿ]f を表示します。表示基底のみを切り替え、入力式の意味や演算は変えません。';
}
