import { MAX_INTEGER_EXPONENT } from '../config/limits.ts';
import type { Expression } from './parser.ts';

/** fpsの範囲は両端を含む。範囲外は定義上0で、ラムダを実行しない。 */
export function degreeRange(args: readonly Expression[], integer: (node: Expression) => bigint): [number, number] {
  const bound = (node: Expression) => {
    const value = integer(node);
    if (value < 0n || value > BigInt(MAX_INTEGER_EXPONENT)) throw new Error(`次数の範囲は0〜${MAX_INTEGER_EXPONENT}の整数で指定してください。`);
    return Number(value);
  };
  return [args[1] ? bound(args[1]) : 0, args[2] ? bound(args[2]) : Infinity];
}
