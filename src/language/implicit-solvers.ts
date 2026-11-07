import type { Field } from '../core/field.ts';
import { CausalSystem } from '../core/causal-system.ts';
import { DifferentialSystem } from '../core/differential-system.ts';
import { ImplicitSystem } from '../core/implicit-system.ts';
import type { SolverMethod } from '../model/calculation.ts';
import type { Expression } from './parser.ts';
import type { Value } from './values.ts';
import { causalCompiler } from './causal-expression.ts';
import { differentialOrders } from './differential-normalize.ts';
import { implicitCompiler } from './implicit-expression.ts';

export type WorkbookSolver<T> = ImplicitSystem<T> | DifferentialSystem<T> | CausalSystem<T>;
export interface SolverContext<T> {
  field: Field<T>;
  names: string[];
  equations: Expression[];
  definitions: ReadonlyMap<string, Expression>;
  initial: ReadonlyMap<string, Expression>;
  evaluate(node: Expression, precision: number): Value<T>;
  external(name: string, precision: number): Value<T> | undefined;
}

/** 解法ごとの初期係数の規約とコンパイラを接続する。解・精度のキャッシュは所有しない。 */
export function createCausalSolver<T>(context: SolverContext<T>, definitions: Expression[] | undefined): CausalSystem<T> {
  const { field, names, evaluate } = context;
  if (!definitions) throw new Error('この系は未知数=右辺の係数逐次形へ整理できません。');
  differentialOrders(definitions, names);
  const initial = names.map(member => {
    const expression = context.initial.get(member); if (!expression) return [];
    let value = evaluate(expression, 1);
    if (value.kind === 'scalar') return [value.value];
    if (value.kind !== 'fps' || value.knownTerms === undefined) throw new Error(`${member} の初期係数は独立したスカラーまたはseq(...)で指定してください。`);
    value = evaluate(expression, value.knownTerms);
    if (value.kind !== 'fps') throw new Error('初期係数には通常FPSが必要です。');
    return [...value.series.asPowerSeries().coefficients];
  });
  return new CausalSystem(field, names, coefficient => {
    const compile = causalCompiler({ field, names, definitions: context.definitions, coefficient, external: context.external });
    return { expressions: definitions.map(compile), validate: compile.validate };
  }, initial);
}

export function createDifferentialSolver<T>(context: SolverContext<T>, orders: number[]): DifferentialSystem<T> {
  const { field, names, equations, evaluate } = context;
  const seed = { degree: undefined as number | undefined };
  const initial = names.map((member, i): (T | undefined)[] => {
    const expression = context.initial.get(member); if (!expression) return [];
    const requested = Math.max(1, orders[i]!);
    let value = evaluate(expression, requested);
    if (value.kind === 'scalar') return [value.value];
    if (value.kind !== 'fps') throw new Error(`${member} の初期係数にはスカラーまたはseq(...)を指定してください。`);
    const count = value.knownTerms ?? requested;
    if (count > requested) value = evaluate(expression, count);
    if (value.kind !== 'fps') throw new Error('初期係数には通常FPSが必要です。');
    return [...value.series.asPowerSeries().coefficients].slice(0, count);
  });
  const compile = implicitCompiler({ field, names, definitions: context.definitions, evaluate, differential: { seed, orders, initial } });
  return new DifferentialSystem(field, names, equations.map(compile), initial, orders, seed, equations.map(eq => differentialOrders([eq], names).orders));
}

export function createAlgebraicSolver<T>(context: SolverContext<T>, method: SolverMethod): ImplicitSystem<T> {
  const { field, names, equations, evaluate } = context;
  const compile = implicitCompiler({ field, names, definitions: context.definitions, evaluate });
  const initial = names.map(member => {
    const expression = context.initial.get(member); if (!expression) return undefined;
    const value = evaluate(expression, 1);
    if (value.kind !== 'scalar') throw new Error(`${member} の定数項には有理数または素数modのスカラーが必要です。`);
    return value.value;
  });
  return new ImplicitSystem(field, names, equations.map(compile), initial, method);
}
