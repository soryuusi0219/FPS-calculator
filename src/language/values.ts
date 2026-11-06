import type { Rational } from '../core/field.ts';
import type { LaurentSeries } from '../core/laurent.ts';
import type { AnalysisReport } from '../model/calculation.ts';
import type { Expression } from './parser.ts';

export interface Scalar<T> {
  kind: 'scalar';
  value: T;
  exact: Rational;
  coefficient?: (index: number) => Scalar<T>;
}
export type Scope<T> = ReadonlyMap<string, Value<T>>;
export interface Lambda<T> {
  kind: 'lambda';
  parameters: string[];
  body: Expression;
  scope: Scope<T>;
}
export interface FpsValue<T> {
  kind: 'fps';
  series: LaurentSeries<T>;
  knownTerms?: number;
}
export interface HistoryValue<T> {
  kind: 'history';
  coefficient(index: number): Scalar<T>;
}
export interface AnalysisValue { kind: 'analysis'; analysis: AnalysisReport }
export type Value<T> = Scalar<T> | FpsValue<T> | HistoryValue<T> | AnalysisValue | Lambda<T> | { kind: 'boolean'; value: boolean };
