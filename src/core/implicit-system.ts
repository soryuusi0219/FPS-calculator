import type { Field } from './field.ts';
import { Series } from './series.ts';
import { inverseMatrix, linearSolve, matrixVector } from './linear-algebra.ts';
import { MAX_INTERNAL_PRECISION, MAX_SYSTEM_UNKNOWNS } from '../config/limits.ts';
import type { SolverMethod } from '../model/calculation.ts';
import type { ImplicitExpression } from './implicit-types.ts';

export class ImplicitSystem<T> {
  private solution: Series<T>[] | undefined;
  private inverse: T[][] | undefined;
  private constants: T[] | undefined;
  method = '';
  constructor(field: Field<T>, names: string[], equations: ImplicitExpression<T>[], initial: (T | undefined)[], requested: SolverMethod = 'auto') {
    this.field = field; this.names = names; this.equations = equations; this.initial = initial; this.requested = requested;
    if (!names.length || names.length > MAX_SYSTEM_UNKNOWNS) throw new Error(`連立系の未知数は1〜${MAX_SYSTEM_UNKNOWNS}個にしてください。`);
    if (equations.length !== names.length) throw new Error(`未知数${names.length}個に対して方程式が${equations.length}本あります。同じ個数にしてください。`);
  }
  private readonly field: Field<T>;
  private readonly names: string[];
  private readonly equations: ImplicitExpression<T>[];
  private readonly initial: (T | undefined)[];
  private readonly requested: SolverMethod;

  private initialize(): void {
    if (this.constants) return;
    const f = this.field;
    const constants = [...this.initial];
    for (let pass = 0; pass <= this.names.length && constants.some((a) => a === undefined); pass++) {
      const affine = this.equations.map((equation) => equation.affine(constants)).filter((a) => a !== undefined);
      const result = linearSolve(f, affine.map((a) => a.coefficients), affine.map((a) => f.sub(f.zero, a.constant)), this.names.length);
      let changed = false;
      result.values.forEach((value, i) => { if (constants[i] === undefined && value !== undefined) { constants[i] = value; changed = true; } });
      if (!changed) break;
    }
    const missing = this.names.filter((_, i) => constants[i] === undefined);
    if (missing.length) throw new Error(`${missing.join(', ')} の定数項が一意に定まりません。定数項を指定してください。恒等的な循環や特異な系では、指定後も解を確定できない場合があります。`);
    const values = constants.map((value) => Series.constant(f, value!, 1));
    const evaluated = this.equations.map((equation) => equation.run(values, 1, true));
    if (evaluated.some((equation) => !f.equal(equation.value.at(0), f.zero))) throw new Error('指定された定数項は方程式の定数項を満たしません。この初期値に対応する解はありません。');
    const jacobian = evaluated.map((equation) => equation.derivatives.map((d) => d.at(0)));
    this.inverse = inverseMatrix(f, jacobian);
    this.constants = constants as T[];
    this.solution = values;
    this.method = this.requested === 'auto' && jacobian.every((row, i) => row.every((a, j) => f.equal(a, i === j ? f.one : f.zero))) ? 'fixed-point' : this.requested === 'newton' ? 'newton' : 'coefficient';
  }

  solve(precision: number): Series<T>[] {
    if (!Number.isInteger(precision) || precision < 1 || precision > MAX_INTERNAL_PRECISION) throw new Error(`連立系に必要な内部精度が上限${MAX_INTERNAL_PRECISION}を超えました。`);
    this.initialize();
    if (this.solution![0]!.precision >= precision) return this.solution!.map((a) => a.truncate(precision));
    const f = this.field;
    if (this.requested === 'auto' && this.method !== 'fixed-point' && precision >= 16) this.method = 'newton';
    let values = this.solution!;
    while (values[0]!.precision < precision) {
      const confirmed = values;
      const previous = values[0]!.precision;
      const n = Math.min(precision, this.method === 'newton' ? 2 * previous : previous + 1);
      // 未確定項のゼロは反復用の近似。確定した級数の精度を増やしてはいない。
      const approximation = values.map((a) => new Series(f, Array.from({ length: n }, (_, k) => a.at(k))));
      const residual = this.equations.map((equation) => equation.run(approximation, n, this.method === 'newton'));
      if (this.method === 'fixed-point') values = approximation.map((a, i) => a.sub(residual[i]!.value));
      else if (this.method === 'coefficient') {
        const next = matrixVector(f, this.inverse!, residual.map((a) => f.sub(f.zero, a.value.at(n - 1))));
        values = values.map((a, i) => new Series(f, [...a.coefficients, next[i]!]));
      } else {
        const correction: T[][] = this.names.map(() => Array<T>(n).fill(f.zero));
        for (let k = 0; k < n; k++) {
          const rhs = residual.map((row) => f.sub(f.zero, row.value.at(k)));
          for (let i = 0; i < this.names.length; i++) for (let j = 0; j < this.names.length; j++) for (let d = 1; d <= k; d++) {
            rhs[i] = f.sub(rhs[i]!, f.mul(residual[i]!.derivatives[j]!.at(d), correction[j]![k - d]!));
          }
          const column = matrixVector(f, this.inverse!, rhs);
          column.forEach((value, i) => { correction[i]![k] = value; });
        }
        values = approximation.map((a, i) => a.add(new Series(f, correction[i]!)));
      }
      if (values.some((a, i) => a.coefficients.slice(0, previous).some((value, k) => !f.equal(value, confirmed[i]!.at(k))))) throw new Error('連立系の確定済み係数が変化しました。精度の検証に失敗しました。');
    }
    const residual = this.equations.map((equation) => equation.run(values, precision, false).value);
    if (residual.some((row) => row.coefficients.some((value) => !f.equal(value, f.zero)))) throw new Error(`連立系の代入残差が O(x^${precision}) になりません。解の検証に失敗しました。`);
    this.solution = values;
    return values;
  }
}
