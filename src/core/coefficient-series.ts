import type { Field } from './field.ts';
import { MAX_EVALUATION_STEPS, MAX_INTERNAL_PRECISION, MAX_INTEGER_EXPONENT } from '../config/limits.ts';
import { kernelCoefficient } from './analytic-coefficients.ts';
import type { AnalyticKernel } from './analytic-coefficients.ts';

export interface CoefficientSeries<T> { readonly order: number; readonly monomial?: { degree: number; coefficient: T }; at(degree: number): T }

/** 係数を要求された時だけ計算する通常FPS。未知の高次係数を0で埋めない。 */
export class CoefficientAlgebra<T> {
  private steps = 0;
  private readonly domainChecks: (()=>void)[] = [];
  readonly field: Field<T>;
  constructor(field: Field<T>) { this.field=field; }
  validateDomains(): void { for(const check of this.domainChecks)check(); }
  series(order: number, coefficient: (degree: number) => T): CoefficientSeries<T> {
    const cache = new Map<number,T>();
    const active = new Set<number>();
    return { order, at: n => {
      if (++this.steps > MAX_EVALUATION_STEPS) throw new Error('係数逐次計算の評価回数が上限を超えました。');
      if (!Number.isInteger(n) || n >= MAX_INTERNAL_PRECISION) throw new Error(`必要な内部精度が上限${MAX_INTERNAL_PRECISION}を超えました。`);
      if (n < 0 || n < order) return this.field.zero;
      if (cache.has(n)) return cache.get(n)!;
      if (active.has(n)) throw new Error(`循環参照: 同じ次数${n}の係数に依存するため、この係数逐次法では未対応です。`);
      active.add(n);
      try { const value=coefficient(n); cache.set(n,value); return value; }
      finally { active.delete(n); }
    }};
  }
  monomial(degree: number, coefficient: T): CoefficientSeries<T> {
    return { ...this.series(this.field.equal(coefficient,this.field.zero)?Infinity:degree,n=>n===degree?coefficient:this.field.zero), monomial:{degree,coefficient} };
  }
  constant(value: T): CoefficientSeries<T> { return this.monomial(0,value); }
  add(a: CoefficientSeries<T>, b: CoefficientSeries<T>, subtract = false): CoefficientSeries<T> {
    return this.series(Math.min(a.order,b.order),n=>this.field[subtract?'sub':'add'](a.at(n),b.at(n)));
  }
  neg(a: CoefficientSeries<T>): CoefficientSeries<T> { return this.series(a.order,n=>this.field.sub(this.field.zero,a.at(n))); }
  mul(a: CoefficientSeries<T>, b: CoefficientSeries<T>): CoefficientSeries<T> {
    const f=this.field;
    if(a.monomial&&b.monomial)return this.monomial(a.monomial.degree+b.monomial.degree,f.mul(a.monomial.coefficient,b.monomial.coefficient));
    if(a.monomial)return this.series(a.order+b.order,n=>f.mul(a.monomial!.coefficient,b.at(n-a.monomial!.degree)));
    if(b.monomial)return this.mul(b,a);
    return this.series(a.order+b.order,n=>{
      let sum=f.zero;
      for(let k=a.order;k<=n-b.order;k++) {
        const left=a.at(k); if(f.equal(left,f.zero))continue;
        const right=b.at(n-k); if(f.equal(right,f.zero))continue;
        sum=f.add(sum,f.mul(left,right));
      }
      return sum;
    });
  }
  inv(a: CoefficientSeries<T>): CoefficientSeries<T> {
    const f=this.field;
    const out=this.series(0,n=>{
      const constant=a.at(0);
      if(f.equal(constant,f.zero))throw new Error('循環の係数逐次法では逆元の定数項が非零である必要があります。Laurent解は未対応です。');
      if(n===0)return f.div(f.one,constant);
      let sum=f.zero;
      for(let k=1;k<=n;k++)sum=f.add(sum,f.mul(a.at(k),out.at(n-k)));
      return f.div(f.sub(f.zero,sum),constant);
    });
    return out;
  }
  div(a: CoefficientSeries<T>, b: CoefficientSeries<T>): CoefficientSeries<T> {
    if(!b.monomial||b.monomial.degree===0)return this.mul(a,this.inv(b));
    const {degree,coefficient}=b.monomial,f=this.field;
    if(f.equal(coefficient,f.zero))throw new Error('0による除算はできません。');
    return this.series(Math.max(0,a.order-degree),n=>{
      for(let k=a.order;k<degree;k++)if(!f.equal(a.at(k),f.zero))throw new Error('この循環の商には負の次数があり、Laurent解は未対応です。');
      return f.div(a.at(n+degree),coefficient);
    });
  }
  pow(a: CoefficientSeries<T>, k: number): CoefficientSeries<T> {
    if(!Number.isSafeInteger(k)||Math.abs(k)>MAX_INTEGER_EXPONENT)throw new Error('整数の指数が上限を超えました。');
    if(a.monomial&&k>=0) {
      let coefficient=this.field.one,base=a.monomial.coefficient,power=k;
      while(power){if(power%2)coefficient=this.field.mul(coefficient,base);power=Math.floor(power/2);if(power)base=this.field.mul(base,base);}
      return this.monomial(a.monomial.degree*k,coefficient);
    }
    let base=k<0?this.inv(a):a,out=this.constant(this.field.one),power=Math.abs(k);
    while(power){if(power%2)out=this.mul(out,base);power=Math.floor(power/2);if(power)base=this.mul(base,base);}
    return out;
  }
  derivative(a: CoefficientSeries<T>): CoefficientSeries<T> { return this.series(Math.max(0,a.order-1),n=>this.field.mul(this.field.fromInteger(BigInt(n+1)),a.at(n+1))); }
  integral(a: CoefficientSeries<T>): CoefficientSeries<T> { return this.series(a.order+1,n=>n===0?this.field.zero:this.field.div(a.at(n-1),this.field.fromInteger(BigInt(n)))); }
  exp(a: CoefficientSeries<T>): CoefficientSeries<T> {
    const f=this.field;
    const out=this.series(0,n=>{
      if(!f.equal(a.at(0),f.zero))throw new Error('exp(f) は f(0)=0 が必要です。');
      if(!n)return f.one;
      let sum=f.zero;
      for(let k=1;k<=n;k++)sum=f.add(sum,f.mul(f.mul(f.fromInteger(BigInt(k)),a.at(k)),out.at(n-k)));
      return f.div(sum,f.fromInteger(BigInt(n)));
    });return out;
  }
  log(a: CoefficientSeries<T>): CoefficientSeries<T> {
    const f=this.field;
    const out=this.series(1,n=>{
      if(!f.equal(a.at(0),f.one))throw new Error('log(f) は f(0)=1 が必要です。');
      let sum=f.mul(f.fromInteger(BigInt(n)),a.at(n));
      for(let k=1;k<n;k++)sum=f.sub(sum,f.mul(f.mul(f.fromInteger(BigInt(k)),out.at(k)),a.at(n-k)));
      return f.div(sum,f.fromInteger(BigInt(n)));
    });
    // order=1で定数項を取り出さない場合も定義域を検証する。
    return this.series(0,n=>{if(!f.equal(a.at(0),f.one))throw new Error('log(f) は f(0)=1 が必要です。');return n?out.at(n):f.zero;});
  }
  sqrt(a: CoefficientSeries<T>): CoefficientSeries<T> {
    const f=this.field;
    const out=this.series(0,n=>{
      if(f.equal(f.fromInteger(2n),f.zero))throw new Error('FPSの平方根は標数2には未対応です。');
      if(f.equal(a.at(0),f.zero))throw new Error('循環の平方根は非零の定数項を持つ場合に対応します。');
      if(n===0)return f.sqrt(a.at(0));
      let value=a.at(n);
      for(let k=1;k<n;k++)value=f.sub(value,f.mul(out.at(k),out.at(n-k)));
      return f.div(value,f.mul(f.fromInteger(2n),out.at(0)));
    });return out;
  }
  compose(outer: CoefficientSeries<T>, inner: CoefficientSeries<T>): CoefficientSeries<T> {
    const f=this.field,powers=[this.constant(f.one)];
    if(inner.monomial&&inner.monomial.degree>0) {
      const {degree,coefficient}=inner.monomial;
      if(f.equal(coefficient,f.zero))return this.series(0,n=>n===0?outer.at(0):f.zero);
      return this.series(0,n=>n%degree?f.zero:f.mul(outer.at(n/degree),this.pow(this.constant(coefficient),n/degree).at(0)));
    }
    const power=(k:number):CoefficientSeries<T>=>{while(powers.length<=k)powers.push(this.mul(powers.at(-1)!,inner));return powers[k]!;};
    return this.series(0,n=>{
      if(!f.equal(inner.at(0),f.zero))throw new Error('合成には内側の定数項が0である必要があります。');
      let sum=f.zero;
      const bound=Math.max(1,inner.order);
      for(let k=0;k<=Math.floor(n/bound);k++) {
        const multiplier=power(k).at(n);if(f.equal(multiplier,f.zero))continue;
        sum=f.add(sum,f.mul(outer.at(k),multiplier));
      }
      return sum;
    });
  }
  analytic(a: CoefficientSeries<T>, name: AnalyticKernel): CoefficientSeries<T> {
    return this.compose(this.series(0,n=>kernelCoefficient(this.field,name,n)),a);
  }
  /** a(b)=xの三角形の係数方程式。nではa[0..n], b[1..n-1]のみ使う。 */
  revert(a: CoefficientSeries<T>): CoefficientSeries<T> {
    const f=this.field;
    const validate=()=>{
      if(!f.equal(a.at(0),f.zero)||f.equal(a.at(1),f.zero))throw new Error('revert(f) は f(0)=0 かつ [x]f≠0 が必要です。');
    };
    this.domainChecks.push(validate);
    const powers:CoefficientSeries<T>[]=[];
    const out=this.series(1,n=>{
      validate();
      if(n===1)return f.div(f.one,a.at(1));
      let sum=f.zero;
      for(let k=2;k<=n;k++) {
        while(powers.length<=k)powers.push(this.mul(powers.at(-1)!,out));
        const multiplier=powers[k]!.at(n);
        if(f.equal(multiplier,f.zero))continue;
        sum=f.add(sum,f.mul(a.at(k),multiplier));
      }
      return f.div(f.sub(f.zero,sum),a.at(1));
    });
    powers.push(this.constant(f.one),out);
    return out;
  }
  euler(a: CoefficientSeries<T>): CoefficientSeries<T> {
    const f=this.field;
    const logarithm=this.series(0,n=>{
      if(!f.equal(a.at(0),f.zero))throw new Error('eulerTransform(f) には f(0)=0 が必要です。');
      let sum=f.zero;
      for(let k=1;k<=n;k++)if(n%k===0)sum=f.add(sum,f.div(a.at(n/k),f.fromInteger(BigInt(k))));
      return sum;
    });return this.exp(logarithm);
  }
}
