import type { Field } from './field.ts';
import { linearSolve } from './linear-algebra.ts';

export function linearRecurrence<T>(f: Field<T>, coefficients: readonly T[], initial: readonly T[], precision: number): T[] {
  if (!coefficients.length || initial.length !== coefficients.length) throw new Error('漸化式の次数と初期値の個数を揃えてください。');
  const values = initial.slice(0, precision);
  for (let n = values.length; n < precision; n++) values.push(coefficients.reduce((sum,c,j) => f.add(sum,f.mul(c,values[n-j-1]!)),f.zero));
  return values;
}
export function rationalGeneratingFunction<T>(f: Field<T>, coefficients: readonly T[], initial: readonly T[]): { numerator: T[]; denominator: T[] } {
  const denominator = [f.one,...coefficients.map(c=>f.sub(f.zero,c))];
  const numerator = initial.map((a,n)=>denominator.slice(1,n+1).reduce((sum,q,j)=>f.add(sum,f.mul(q,initial[n-j-1]!)),a));
  return { numerator,denominator };
}
export function guessRecurrence<T>(f: Field<T>, sequence: readonly T[], training: number, maxOrder: number) {
  if (!Number.isInteger(training) || training < 2 || training >= sequence.length) throw new Error('推測には学習用2項以上と、それに続く未使用の検証用1項以上が必要です。');
  if (!Number.isInteger(maxOrder) || maxOrder < 1 || maxOrder > 16) throw new Error('推測する最大次数は1〜16です。');
  for (let order=1; order<=Math.min(maxOrder,Math.floor(training/2)); order++) {
    const matrix = Array.from({length:training-order},(_,i)=>Array.from({length:order},(_,j)=>sequence[i+order-j-1]!));
    let solved: ReturnType<typeof linearSolve<T>>;
    try { solved=linearSolve(f,matrix,sequence.slice(order,training),order); } catch { continue; }
    if (solved.rank!==order || solved.values.some(c=>c===undefined)) continue;
    const coefficients=solved.values as T[];
    const initial=sequence.slice(0,order);
    const predicted=linearRecurrence(f,coefficients,initial,sequence.length);
    const mismatch=sequence.findIndex((a,n)=>n>=training&&!f.equal(a,predicted[n]!));
    return {order,coefficients,initial,training,validation:sequence.length-training,mismatch,...rationalGeneratingFunction(f,coefficients,initial)};
  }
  return null;
}
export function binomialTransform<T>(f: Field<T>, source: readonly T[], inverse=false): T[] {
  return source.map((_,n)=>{
    let binomial=1n, sum=f.zero;
    for(let k=0;k<=n;k++) {
      const signed=inverse&&(n-k)%2 ? -binomial : binomial;
      sum=f.add(sum,f.mul(f.fromInteger(signed),source[k]!));
      binomial=binomial*BigInt(n-k)/BigInt(k+1);
    }
    return sum;
  });
}
export function evaluatePolynomial<T>(f: Field<T>, coefficients: readonly T[], n: number): T {
  return coefficients.reduceRight((value,c)=>f.add(f.mul(value,f.fromInteger(BigInt(n))),c),f.zero);
}
export function pRecursive<T>(f: Field<T>, polynomials: readonly (readonly T[])[], initial: readonly T[], precision: number): T[] {
  const order=polynomials.length-1;
  if(order<1||initial.length<order)throw new Error('p-recursiveの次数に応じた初期値が必要です。');
  const out=initial.slice(0,order);
  for(let n=0;out.length<precision;n++) {
    const divisor=evaluatePolynomial(f,polynomials[order]!,n);
    if(f.equal(divisor,f.zero))throw new Error(`n=${n} で最高シフトの係数が0です。この初期値から先を一意に生成できません。`);
    const sum=polynomials.slice(0,order).reduce((a,p,j)=>f.add(a,f.mul(evaluatePolynomial(f,p,n),out[n+j]!)),f.zero);
    out.push(f.div(f.sub(f.zero,sum),divisor));
  }
  return out.slice(0,precision);
}
/** sum_j p_j(n) a_(n+j)=0 を通常母関数の微分方程式 sum_l q_l(x) F^(l)=b(x) に変換する。 */
export function recurrenceToDifferential<T>(f: Field<T>, polynomials: readonly (readonly T[])[], initial: readonly T[]) {
  const order=polynomials.length-1, degree=Math.max(...polynomials.map(p=>p.length-1));
  if(order<1||initial.length<order)throw new Error('微分方程式の復元には次数分の初期値が必要です。');
  const size=order+degree+1;
  const operators=Array.from({length:degree+1},()=>Array<T>(size).fill(f.zero));
  const boundary=Array<T>(size).fill(f.zero);
  const stirling=Array.from({length:degree+1},()=>Array<bigint>(degree+1).fill(0n));stirling[0]![0]=1n;
  for(let k=1;k<=degree;k++)for(let l=1;l<=k;l++)stirling[k]![l]=stirling[k-1]![l-1]!+BigInt(l)*stirling[k-1]![l]!;
  polynomials.forEach((p,j)=>{
    const shifted=Array<T>(p.length).fill(f.zero);
    p.forEach((c,k)=>{
      let binomial=1n;
      for(let l=0;l<=k;l++) {
        shifted[l]=f.add(shifted[l]!,f.mul(c,f.fromInteger(binomial*BigInt(-j)**BigInt(k-l))));
        binomial=binomial*BigInt(k-l)/BigInt(l+1);
      }
    });
    for(let k=0;k<shifted.length;k++)for(let l=0;l<=k;l++) {
      const d=order-j+l;
      operators[l]![d]=f.add(operators[l]![d]!,f.mul(shifted[k]!,f.fromInteger(stirling[k]![l]!)));
    }
    for(let m=0;m<j;m++) {
      const d=order-j+m;
      boundary[d]=f.add(boundary[d]!,f.mul(evaluatePolynomial(f,p,m-j),initial[m]!));
    }
  });
  const trim=(p:T[])=>{while(p.length>1&&f.equal(p.at(-1)!,f.zero))p.pop();return p;};
  let common=0;
  while(common<size-1&&[...operators,boundary].every(p=>f.equal(p[common]!,f.zero)))common++;
  return {operators:operators.map(p=>trim(p.slice(common))),boundary:trim(boundary.slice(common))};
}
