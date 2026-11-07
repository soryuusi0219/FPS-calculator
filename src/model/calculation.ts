/** Worker、評価器、UIの間で共有するDOM非依存の入出力。 */
export interface InputRow { id: string; source: string; initial?: string; comment?: string }
export type SolverMethod = 'auto' | 'coefficient' | 'newton';
export interface EquationSystemInput { id: string; variables: string; equations: string; method: SolverMethod }
export interface Calculation {
  rows: InputRow[];
  terms: number;
  domain: 'rational' | 'prime';
  modulus: string;
  basis: 'ogf' | 'egf';
  systems?: EquationSystemInput[];
}
export interface AnalysisReport { title: string; lines: string[]; expression?: string }
export interface RowResult {
  id: string;
  name: string | null;
  valueType?: 'scalar' | 'fps' | 'laurent' | 'lambda' | 'boolean' | 'analysis';
  value?: string;
  coefficients?: string[];
  startDegree?: number;
  tex?: string;
  resultTex?: string;
  error?: string;
  diagnostic?: { start: number; end: number; message: string };
  analysis?: AnalysisReport;
  solver?: { names: string[]; method: string; precision: number };
}
export interface EquationSystemResult { id: string; solutions: RowResult[]; error?: string }
export interface CalculationResult { rows: RowResult[]; error?: string; systems?: EquationSystemResult[] }
export type SeriesResult = RowResult & {
  valueType: 'fps' | 'laurent';
  coefficients: string[];
  startDegree: number;
  resultTex: string;
};
export function isSeriesResult(result?: RowResult): result is SeriesResult {
  return result?.valueType === 'fps' || result?.valueType === 'laurent';
}
