import type { Field } from './core/field.ts';
import { primeField, rationalField } from './core/field.ts';
import type { Statement } from './language/parser.ts';
import { parse } from './language/parser.ts';
import { Evaluator } from './language/evaluator.ts';
import { expressionTex, scalarTex, seriesTex, statementTex } from './language/tex.ts';
import { MAX_ROWS, MAX_TERMS } from './config/limits.ts';
import type { Calculation, CalculationResult, InputRow, RowResult } from './model/calculation.ts';

// 既存の公開入口を維持する。UIはmodel/configを直接参照する。
export { MAX_ROWS, MAX_TERMS } from './config/limits.ts';
export type { Calculation, CalculationResult, InputRow, RowResult } from './model/calculation.ts';
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

/** Workerとテストが共有する、DOM非依存のエントリポイント。 */
export function calculate(input: Calculation): CalculationResult {
  try {
    if (!Number.isInteger(input.terms) || input.terms < 1 || input.terms > MAX_TERMS) throw new Error(`項数は 1〜${MAX_TERMS} を指定してください。`);
    if (input.rows.length > MAX_ROWS) throw new Error(`式は ${MAX_ROWS} 行までです。`);
    if (input.domain === 'rational') return evaluateWorkbook(input, rationalField);
    if (!/^\d{1,10}$/.test(input.modulus)) throw new Error('mod は10桁以内の素数を整数で入力してください。');
    return evaluateWorkbook(input, primeField(BigInt(input.modulus)));
  } catch (error) { return { rows: [], error: message(error) }; }
}

function evaluateWorkbook<T>(input: Calculation, field: Field<T>): CalculationResult {
  const parsed = new Map<string, Statement>();
  const failures = new Map<string, string>();
  const definitions = new Map<string, InputRow[]>();
  for (const row of input.rows) {
    if (!row.source.trim()) continue;
    try {
      const statement = parse(row.source);
      parsed.set(row.id, statement);
      if (statement.name) definitions.set(statement.name, [...(definitions.get(statement.name) ?? []), row]);
    } catch (error) { failures.set(row.id, message(error)); }
  }
  const evaluator = new Evaluator(field, (name) => {
    const rows = definitions.get(name);
    if (!rows) throw new Error(`未定義の変数: ${name}`);
    if (rows.length !== 1) throw new Error(`${name} が複数の行で定義されています。`);
    return parsed.get(rows[0]!.id)!.expression;
  });

  return {
    rows: input.rows.map((row): RowResult => {
      const statement = parsed.get(row.id);
      if (failures.has(row.id)) return { id: row.id, name: null, error: failures.get(row.id)! };
      if (!statement) return { id: row.id, name: null };
      const common = { id: row.id, name: statement.name, tex: statementTex(statement) };
      try {
        const value = statement.name ? evaluator.symbol(statement.name, input.terms) : evaluator.evaluate(statement.expression, input.terms);
        if (value.kind === 'scalar') {
          const formatted = field.format(value.value);
          return { ...common, valueType: 'scalar', value: formatted, resultTex: scalarTex(formatted) };
        }
        if (value.kind === 'boolean') return { ...common, valueType: 'boolean', value: String(value.value), resultTex: `\\mathrm{${value.value}}` };
        if (value.kind === 'lambda') return { ...common, valueType: 'lambda', value: `ラムダ (${value.parameters.join(', ')})`, resultTex: expressionTex(value) };
        const startDegree = value.series.startDegree;
        if (startDegree < 0 && input.basis === 'egf') throw new Error('負の次数を持つLaurent級数はE.G.F.表示に対応していません。O.G.F.表示へ切り替えてください。');
        if (input.domain === 'prime' && input.basis === 'egf' && BigInt(input.terms) > BigInt(input.modulus)) throw new Error('E.G.F. 表示には項数 N ≤ mod が必要です（階乗の可逆性）。');
        let factorial = field.one;
        const coefficients = value.series.coefficients.map((coefficient, n) => {
          if (n > 0) factorial = field.mul(factorial, field.fromInteger(BigInt(n)));
          return field.format(input.basis === 'egf' ? field.mul(coefficient, factorial) : coefficient);
        });
        return { ...common, valueType: startDegree < 0 ? 'laurent' : 'fps', startDegree, coefficients, resultTex: seriesTex(coefficients, input.basis, startDegree) };
      } catch (error) { return { ...common, error: message(error) }; }
    }),
  };
}
