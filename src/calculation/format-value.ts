import type { Field } from '../core/field.ts';
import type { AnalysisReport, Calculation, RowResult } from '../model/calculation.ts';
import type { FpsValue, Value } from '../language/values.ts';
import { parse, parseEquation } from '../language/parser.ts';
import { expressionTex, scalarTex, seriesTex } from '../language/tex.ts';

function analysisTex(expression: string | undefined): string | undefined {
  if (!expression) return;
  try {
    if (expression.includes(' = ')) {
      const equation = parseEquation(expression);
      if (equation.kind === 'binary') return `${expressionTex(equation.left)}=${expressionTex(equation.right)}`;
    } else return expressionTex(parse(expression).expression);
  } catch { /* 大きな復元式はテキストで表示する。 */ }
  return;
}

function formatAnalysis(input: Calculation, common: RowResult, report: AnalysisReport): RowResult {
  const analysis = {
    ...report,
    lines: [input.domain === 'rational' ? '係数体: ℚ' : `係数体: mod ${input.modulus}`, ...report.lines],
  };
  const resultTex = analysisTex(analysis.expression);
  return {
    ...common, valueType: 'analysis', value: [analysis.title, ...analysis.lines].join('\n'), analysis,
    ...(resultTex ? { resultTex } : {}),
  };
}

function formatSeries<T>(input: Calculation, field: Field<T>, common: RowResult, value: FpsValue<T>): RowResult {
  const startDegree = value.series.startDegree;
  if (startDegree < 0 && input.basis === 'egf') throw new Error('負の次数を持つLaurent級数はE.G.F.表示に対応していません。O.G.F.表示へ切り替えてください。');
  if (input.domain === 'prime' && input.basis === 'egf' && BigInt(input.terms) > BigInt(input.modulus)) throw new Error('E.G.F. 表示には項数 N ≤ mod が必要です（階乗の可逆性）。');
  let factorial = field.one;
  const coefficients = value.series.coefficients.map((coefficient, n) => {
    if (n > 0) factorial = field.mul(factorial, field.fromInteger(BigInt(n)));
    return field.format(input.basis === 'egf' ? field.mul(coefficient, factorial) : coefficient);
  });
  return {
    ...common, valueType: startDegree < 0 ? 'laurent' : 'fps', startDegree, coefficients,
    resultTex: seriesTex(coefficients, input.basis, startDegree),
  };
}

/** 評価済みの値をWorkerへ返す表示データへ変換する。名前解決や再計算は行わない。 */
export function formatValue<T>(input: Calculation, field: Field<T>, common: RowResult, value: Value<T>): RowResult {
  switch (value.kind) {
    case 'analysis': return formatAnalysis(input, common, value.analysis);
    case 'fps': return formatSeries(input, field, common, value);
    case 'scalar': {
      const formatted = field.format(value.value);
      return { ...common, valueType: 'scalar', value: formatted, resultTex: scalarTex(formatted) };
    }
    case 'boolean': return { ...common, valueType: 'boolean', value: String(value.value), resultTex: `\\mathrm{${value.value}}` };
    case 'lambda': return { ...common, valueType: 'lambda', value: `ラムダ (${value.parameters.join(', ')})`, resultTex: expressionTex(value) };
    case 'history': throw new Error('漸化式の履歴はa[k]の形で参照してください。');
  }
}
