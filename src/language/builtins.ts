export type CombinatorialKind = 'C' | 'P' | 'H' | 's1' | 's2';
interface BuiltinDefinition { arity: number; minArity?: number; maxArity?: number; combinatorial?: CombinatorialKind }

/** 予約語・引数数・組合せ関数の別名を一か所で定義する。 */
export const builtinDefinitions = {
  exp: { arity: 1 }, log: { arity: 1 }, inv: { arity: 1 }, compose: { arity: 2 },
  revert: { arity: 1 }, diff: { arity: 1 }, integral: { arity: 1 }, map: { arity: 2 },
  sqrt: { arity: 1 }, fps: { arity: 1 }, coeff: { arity: 2 }, if: { arity: 3 },
  factorial: { arity: 1 },
  seq: { arity: 1, minArity: 1, maxArity: 64 },
  recurrence: { arity: 3 }, linrec: { arity: 3 }, rationalGF: { arity: 3 },
  pRecursive: { arity: 3, minArity: 3, maxArity: 10 },
  pRecGF: { arity: 3, minArity: 3, maxArity: 10 },
  guess: { arity: 3 }, compare: { arity: 2 },
  partialSums: { arity: 1 }, binomialTransform: { arity: 1 }, inverseBinomialTransform: { arity: 1 },
  hadamard: { arity: 2 }, even: { arity: 1 }, odd: { arity: 1 }, extract: { arity: 3 },
  Catalan: { arity: 1 }, LambertW: { arity: 1 },
  nCk: { arity: 2, combinatorial: 'C' }, binom: { arity: 2, combinatorial: 'C' },
  nPk: { arity: 2, combinatorial: 'P' },
  nHk: { arity: 2, combinatorial: 'H' },
  stirling1: { arity: 2, combinatorial: 's1' }, s1: { arity: 2, combinatorial: 's1' },
  stirling2: { arity: 2, combinatorial: 's2' }, s2: { arity: 2, combinatorial: 's2' },
} as const satisfies Record<string, BuiltinDefinition>;

export type BuiltinName = keyof typeof builtinDefinitions;
export const functionNames = Object.keys(builtinDefinitions) as BuiltinName[];
export function builtinDefinition(name: string): BuiltinDefinition | undefined {
  return Object.hasOwn(builtinDefinitions, name) ? builtinDefinitions[name as BuiltinName] : undefined;
}

export function validateBuiltinArity(name: string, count: number): void {
  const definition = builtinDefinition(name)!;
  const minimum = definition.minArity ?? definition.arity;
  const maximum = definition.maxArity ?? definition.arity;
  if (count < minimum || count > maximum) throw new Error(`${name} には ${minimum === maximum ? minimum : `${minimum}〜${maximum}`} 個の引数が必要です。`);
}
