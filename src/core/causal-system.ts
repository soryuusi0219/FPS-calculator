import type { Field } from './field.ts';
import { Series } from './series.ts';
import { MAX_INTERNAL_PRECISION, MAX_SYSTEM_UNKNOWNS } from '../config/limits.ts';
import type { CoefficientSeries } from './coefficient-series.ts';
interface CompiledSystem<T> { expressions: CoefficientSeries<T>[]; validate(): void }

/** 係数間の依存を追跡し、同次数の非循環な参照も含め、下の次数から確定する。 */
export class CausalSystem<T> {
  readonly method = 'causal-coefficient';
  private solution: Series<T>[] | undefined;
  private readonly field: Field<T>;
  private readonly names: string[];
  private readonly compile: (coefficient: (name: string, degree: number) => T) => CompiledSystem<T>;
  private readonly initial: (T | undefined)[][];
  constructor(field: Field<T>, names: string[],
    compile: (coefficient: (name: string, degree: number) => T) => CompiledSystem<T>, initial: (T | undefined)[][]) {
    this.field=field;this.names=names;this.compile=compile;this.initial=initial;
    if(!names.length||names.length>MAX_SYSTEM_UNKNOWNS)throw new Error(`連立系の未知数は1〜${MAX_SYSTEM_UNKNOWNS}個にしてください。`);
  }
  solve(precision: number): Series<T>[] {
    if(!Number.isInteger(precision)||precision<1||precision>MAX_INTERNAL_PRECISION)throw new Error(`必要な内部精度が上限${MAX_INTERNAL_PRECISION}を超えました。`);
    if(this.solution&&this.solution[0]!.precision>=precision)return this.solution.map(series=>series.truncate(precision));
    const f=this.field;
    const values=this.names.map((_,i)=>new Map<number,T>(this.initial[i]!.flatMap((value,n)=>value===undefined?[]:[[n,value] as [number,T]])));
    const active=new Set<string>();
    const used=this.names.map(()=>new Set<number>());
    const verification:[number,number][]=[];
    let degree=0;
    let validatingDomain=false;
    const coefficient=(name:string,n:number):T=>{
      if(n<0)return f.zero;
      const i=this.names.indexOf(name);
      if(n>degree) {
        if(!validatingDomain||active.size)throw new Error(`循環参照: ${name}[${degree}]の確定前に高い次数${n}が必要です。この係数依存は未対応です。初期値が必要な微分方程式には微積分ソルバーを使用してください。`);
        // 定義域の確認自体が追加係数を必要とするときは、同じ厳密な依存規則で延長する。
        for(;degree<=n;degree++)for(const member of this.names)coefficient(member,degree);
        degree=n;
      }
      if(!used[i]!.has(n)){used[i]!.add(n);verification.push([i,n]);}
      if(values[i]!.has(n))return values[i]!.get(n)!;
      const key=`${name}:${n}`;
      if(active.has(key))throw new Error(`循環参照: ${name}[${n}] が同じ係数へ依存します。下の次数から一意に決まらない系は、この係数逐次法では未対応です。`);
      active.add(key);
      try { const value=expressions[i]!.at(n);values[i]!.set(n,value);return value; }
      finally {active.delete(key);}
    };
    const {expressions,validate}=this.compile(coefficient);
    if(expressions.length!==this.names.length)throw new Error('係数逐次系の方程式数が不正です。');
    for(degree=0;degree<precision;degree++) {
      for(const name of this.names)coefficient(name,degree);
      for(let i=0;i<this.names.length;i++)if(!f.equal(expressions[i]!.at(degree),values[i]!.get(degree)!))throw new Error(`${this.names[i]} の初期係数・代入残差に不一致があります（次数${degree}）。`);
    }
    // revertの定義域確認に必要な補助係数も、未来参照を許さず順番に確定する。
    validatingDomain=true;
    try { validate(); } finally { validatingDomain=false; }
    // 残差の検証中に別の初期係数を参照した場合も、追加した順に検証する。
    for(const [i,n] of verification)if(!f.equal(expressions[i]!.at(n),values[i]!.get(n)!))throw new Error(`${this.names[i]} の初期係数・代入残差に不一致があります（次数${n}）。`);
    const result=values.map(row=>new Series(f,Array.from({length:precision},(_,n)=>row.get(n)!)));
    // 延長が失敗した場合、前回の検証済みprefixは変更しない。
    if(this.solution)for(let i=0;i<result.length;i++)for(let n=0;n<this.solution[i]!.precision;n++)if(!f.equal(result[i]!.at(n),this.solution[i]!.at(n)))throw new Error('係数逐次系の確定済み係数が変化しました。');
    this.solution=result;
    return result;
  }
}
