import type { Field } from '../../core/field.ts';
import { guessRecurrence, rationalGeneratingFunction } from '../../core/sequences.ts';
import { MAX_RECURRENCE_ORDER } from '../../config/limits.ts';
import type { Expression } from '../parser.ts';
import type { AnalysisValue, Value } from '../values.ts';
import type { SequenceContext } from './context.ts';

export function polynomialText<T>(f: Field<T>, coefficients: readonly T[]): string {
  return coefficients.flatMap((coefficient, degree) => f.equal(coefficient, f.zero) ? [] : [
    `(${f.format(coefficient)})${degree ? `*x${degree === 1 ? '' : `^${degree}`}` : ''}`,
  ]).join('+') || '0';
}
export function report(title: string, lines: string[], expression?: string): AnalysisValue {
  return { kind: 'analysis', analysis: { title, lines, ...(expression === undefined ? {} : { expression }) } };
}
export function rationalLines<T>(f: Field<T>, coefficients: readonly T[], initial: readonly T[]) {
  const { numerator, denominator } = rationalGeneratingFunction(f, coefficients, initial);
  const expression = `(${polynomialText(f, numerator)})/(${polynomialText(f, denominator)})`;
  return { expression, lines: [
    `通常母関数 F(x) = ${expression}`,
    `a_n = ${coefficients.map((value, j) => `(${f.format(value)}) a_(n-${j + 1})`).join(' + ')} (n ≥ ${coefficients.length})`,
    `初期値: ${initial.map(value => f.format(value)).join(', ')}`,
  ] };
}

export function guessBuiltin<T>(context: SequenceContext<T>, args: Expression[]): Value<T> {
  const { field: f, evaluate, integer, precision } = context;
  let input = evaluate(args[0]!);
  if (input.kind === 'fps' && input.knownTerms !== undefined && input.knownTerms > precision) input = evaluate(args[0]!, input.knownTerms);
  const training = integer(args[1]!, 2, 63), maxOrder = integer(args[2]!, 1, MAX_RECURRENCE_ORDER);
  if (input.kind !== 'fps') throw new Error('推測対象は通常FPSまたはseq(...)にしてください。');
  const sequence = input.series.asPowerSeries().coefficients.slice(0, input.knownTerms ?? precision);
  const candidate = guessRecurrence(f, sequence, training, maxOrder);
  const note = '有限項からの候補です。無限級数の恒等性を証明するものではありません。';
  if (!candidate) return report('線形漸化式の候補なし', [
    `学習 ${training}項 / 検証 ${sequence.length - training}項 / 最大次数 ${maxOrder}`,
    '指定次数内で一意な候補を決定できません。情報不足または非対応の数列です。', note,
  ]);
  const result = rationalLines(f, candidate.coefficients, candidate.initial);
  return report(candidate.mismatch < 0 ? '線形漸化式の候補（未使用項でも一致）' : '線形漸化式の候補（検証不一致）', [
    `学習 a_0…a_${training - 1} / 検証 a_${training}…a_${sequence.length - 1}`,
    `候補の次数: ${candidate.order}`,
    candidate.mismatch < 0 ? `検証 ${candidate.validation}項すべてで一致` : `最初の不一致: a_${candidate.mismatch}`,
    note, ...result.lines,
  ], result.expression);
}

export function compareBuiltin<T>(context: SequenceContext<T>, args: Expression[]): Value<T> {
  const { field: f, evaluate, precision } = context;
  const a = evaluate(args[0]!), b = evaluate(args[1]!);
  if (a.kind !== 'fps' || b.kind !== 'fps') throw new Error('compare には2つのFPS/Laurent級数を指定してください。');
  const start = Math.min(a.series.startDegree, b.series.startDegree);
  let mismatch: number | undefined;
  for (let n = start; n < precision; n++) {
    if (!f.equal(a.series.at(n), b.series.at(n))) { mismatch = n; break; }
  }
  return report(mismatch === undefined ? '指定精度まで一致' : '係数が異なります', [
    `比較範囲: 次数 ${start}…${precision - 1}（通常係数）`,
    mismatch === undefined ? `差は O(x^${precision})。無限級数の恒等性は判定していません。`
      : `最初の差: [x^${mismatch}] 左=${f.format(a.series.at(mismatch))}, 右=${f.format(b.series.at(mismatch))}`,
  ]);
}
