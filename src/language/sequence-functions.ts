import type { Expression } from './parser.ts';
import type { Value } from './values.ts';
import { createSequenceContext } from './sequences/context.ts';
import type { SequenceContext, SequenceRuntime } from './sequences/context.ts';
import { compareBuiltin, guessBuiltin } from './sequences/analysis.ts';
import { linearBuiltin, pRecursiveBuiltin, recurrenceBuiltin, sequenceLiteral } from './sequences/recurrences.ts';
import { transformBuiltin } from './sequences/transforms.ts';

type Handler = <T>(context: SequenceContext<T>, args: Expression[]) => Value<T>;
const handlers: Record<string, Handler> = {
  seq: sequenceLiteral,
  recurrence: recurrenceBuiltin,
  linrec: (context, args) => linearBuiltin(context, args),
  rationalGF: (context, args) => linearBuiltin(context, args, true),
  pRecursive: (context, args) => pRecursiveBuiltin(context, args),
  pRecGF: (context, args) => pRecursiveBuiltin(context, args, true),
  guess: guessBuiltin,
  compare: compareBuiltin,
};
for (const name of ['partialSums', 'binomialTransform', 'inverseBinomialTransform', 'hadamard', 'even', 'odd', 'extract']) {
  handlers[name] = (context, args) => transformBuiltin(context, name, args);
}
export const sequenceFunctionNames = new Set(Object.keys(handlers));

/** 公開入口は維持し、数列関数の種類ごとに実装を委譲する。 */
export function sequenceBuiltin<T>(runtime: SequenceRuntime<T>, name: string, args: Expression[], precision: number): Value<T> {
  if (!Object.hasOwn(handlers, name)) throw new Error(`未定義の数列関数: ${name}`);
  return handlers[name]!(createSequenceContext(runtime, precision), args);
}
