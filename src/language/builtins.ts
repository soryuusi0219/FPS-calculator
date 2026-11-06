export type CombinatorialKind = 'C' | 'P' | 'H' | 's1' | 's2';
interface BuiltinDefinition { arity: number; combinatorial?: CombinatorialKind }

/** 予約語・引数数・組合せ関数の別名を一か所で定義する。 */
export const builtinDefinitions = {
  exp: { arity: 1 }, log: { arity: 1 }, inv: { arity: 1 }, compose: { arity: 2 },
  revert: { arity: 1 }, diff: { arity: 1 }, integral: { arity: 1 }, map: { arity: 2 },
  sqrt: { arity: 1 }, fps: { arity: 1 }, coeff: { arity: 2 }, if: { arity: 3 },
  factorial: { arity: 1 },
  C: { arity: 2, combinatorial: 'C' }, nCk: { arity: 2, combinatorial: 'C' }, binom: { arity: 2, combinatorial: 'C' },
  P: { arity: 2, combinatorial: 'P' }, nPk: { arity: 2, combinatorial: 'P' },
  H: { arity: 2, combinatorial: 'H' }, nHk: { arity: 2, combinatorial: 'H' },
  stirling1: { arity: 2, combinatorial: 's1' }, s1: { arity: 2, combinatorial: 's1' },
  stirling2: { arity: 2, combinatorial: 's2' }, s2: { arity: 2, combinatorial: 's2' },
} as const satisfies Record<string, BuiltinDefinition>;

export type BuiltinName = keyof typeof builtinDefinitions;
export const functionNames = Object.keys(builtinDefinitions) as BuiltinName[];
export function builtinDefinition(name: string): BuiltinDefinition | undefined {
  return Object.hasOwn(builtinDefinitions, name) ? builtinDefinitions[name as BuiltinName] : undefined;
}
