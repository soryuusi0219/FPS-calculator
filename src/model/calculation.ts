/** Worker、評価器、UIの間で共有するDOM非依存の入出力。 */
export interface InputRow { id: string; source: string }
export interface Calculation {
  rows: InputRow[];
  terms: number;
  domain: 'rational' | 'prime';
  modulus: string;
  basis: 'ogf' | 'egf';
}
export interface RowResult {
  id: string;
  name: string | null;
  valueType?: 'scalar' | 'fps' | 'laurent' | 'lambda' | 'boolean';
  value?: string;
  coefficients?: string[];
  startDegree?: number;
  tex?: string;
  resultTex?: string;
  error?: string;
}
export interface CalculationResult { rows: RowResult[]; error?: string }
export type SeriesResult = RowResult & {
  valueType: 'fps' | 'laurent';
  coefficients: string[];
  startDegree: number;
  resultTex: string;
};
export function isSeriesResult(result?: RowResult): result is SeriesResult {
  return result?.valueType === 'fps' || result?.valueType === 'laurent';
}
