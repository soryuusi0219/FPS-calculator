/** 整数上で計算してから係数体へ写す。小さいmodでも階乗の逆元を要求しない。 */
export const MAX_COMBINATORIAL = 2000;
export const MAX_STIRLING = 256;

export function boundedInteger(value: bigint, label: string, maximum = MAX_COMBINATORIAL): number {
  if (value < 0n || value > BigInt(maximum)) throw new Error(`${label} は 0〜${maximum} の整数を指定してください。`);
  return Number(value);
}

export function factorial(n: bigint): bigint {
  boundedInteger(n, '階乗の引数');
  let result = 1n;
  for (let k = 2n; k <= n; k++) result *= k;
  return result;
}

export function combinatorial(kind: 'C' | 'P' | 'H' | 's1' | 's2', n: bigint, k: bigint): bigint {
  boundedInteger(n, 'n', kind === 's1' || kind === 's2' ? MAX_STIRLING : MAX_COMBINATORIAL);
  if (k < 0n) return 0n;
  boundedInteger(k, 'k');
  if (kind === 'H') {
    if (n === 0n) return k === 0n ? 1n : 0n;
    return combinatorial('C', n + k - 1n, k);
  }
  if (k > n) return 0n;
  if (kind === 's1' || kind === 's2') {
    let row = [1n];
    for (let i = 1; i <= Number(n); i++) {
      const next = Array<bigint>(Math.min(i, Number(k)) + 1).fill(0n);
      for (let j = 1; j < next.length; j++) next[j] = (row[j - 1] ?? 0n) + BigInt(kind === 's1' ? i - 1 : j) * (row[j] ?? 0n);
      row = next;
    }
    return row[Number(k)] ?? 0n;
  }
  let result = 1n;
  if (kind === 'P') { for (let i = 0n; i < k; i++) result *= n - i; }
  else {
    k = k < n - k ? k : n - k;
    for (let i = 1n; i <= k; i++) result = result * (n - i + 1n) / i;
  }
  return result;
}
