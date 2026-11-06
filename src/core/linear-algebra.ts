import type { Field } from './field.ts';

/** 矩形系も扱うGauss-Jordan法。一意に決まらない成分はundefinedのまま返す。 */
export function linearSolve<T>(field: Field<T>, matrix: readonly (readonly T[])[], rhs: readonly T[], columns: number): { values: (T | undefined)[]; rank: number } {
  const a = matrix.map((row, i) => [...row, rhs[i]!]);
  const pivots: number[] = [];
  for (let column = 0; column < columns; column++) {
    const found = a.findIndex((row, i) => i >= pivots.length && !field.equal(row[column]!, field.zero));
    if (found < 0) continue;
    const index = pivots.length;
    [a[index], a[found]] = [a[found]!, a[index]!];
    const divisor = a[index]![column]!;
    a[index] = a[index]!.map((value) => field.div(value, divisor));
    for (let i = 0; i < a.length; i++) {
      if (i === index) continue;
      const factor = a[i]![column]!;
      a[i] = a[i]!.map((value, j) => field.sub(value, field.mul(factor, a[index]![j]!)));
    }
    pivots.push(column);
  }
  for (const row of a) if (row.slice(0, columns).every((value) => field.equal(value, field.zero)) && !field.equal(row[columns]!, field.zero)) throw new Error('方程式が矛盾しています。指定した係数体では解が存在しません。');
  const values: (T | undefined)[] = Array(columns).fill(undefined);
  pivots.forEach((column, i) => {
    if (a[i]!.slice(0, columns).every((value, j) => pivots.includes(j) || field.equal(value, field.zero))) values[column] = a[i]![columns]!;
  });
  return { values, rank: pivots.length };
}

/** 定数Jacobianの逆行列を一度だけ求め、全次数で再利用する。 */
export function inverseMatrix<T>(field: Field<T>, matrix: readonly (readonly T[])[]): T[][] {
  const n = matrix.length;
  let columns: ReturnType<typeof linearSolve<T>>[];
  try { columns = Array.from({ length: n }, (_, k) => linearSolve(field, matrix, Array.from({ length: n }, (_, i) => i === k ? field.one : field.zero), n)); }
  catch { throw new Error('Jacobianが特異です。この方法では解の存在・一意性を判定できません。'); }
  if (columns.some((column) => column.rank !== n)) throw new Error('Jacobianが特異です。この方法では解の存在・一意性を判定できません。');
  return Array.from({ length: n }, (_, i) => columns.map((column) => column.values[i]!));
}

export function matrixVector<T>(field: Field<T>, matrix: readonly (readonly T[])[], vector: readonly T[]): T[] {
  return matrix.map((row) => row.reduce((sum, value, i) => field.add(sum, field.mul(value, vector[i]!)), field.zero));
}
