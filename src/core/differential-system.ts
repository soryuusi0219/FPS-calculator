import type { Field } from './field.ts';
import { Series } from './series.ts';
import { linearSolve } from './linear-algebra.ts';
import type { ImplicitExpression } from './implicit-types.ts';
import { MAX_INTERNAL_PRECISION, MAX_SYSTEM_UNKNOWNS } from '../config/limits.ts';
export interface CoefficientSeed { degree: number | undefined }

/** 微積分のFrechet微分を係数方向に適用し、未確定係数だけを次数順に解く。 */
export class DifferentialSystem<T> {
  readonly method='differential-coefficient';
  private coefficients: T[][] | undefined;
  private precision=0;
  private readonly checked: number[];
  private readonly equationOrders: number[][];
  private readonly field:Field<T>;
  private readonly names:string[];
  private readonly equations:ImplicitExpression<T>[];
  private readonly initial:(T|undefined)[][];
  private readonly orders:number[];
  private readonly seed:CoefficientSeed;
  constructor(field:Field<T>,names:string[],equations:ImplicitExpression<T>[],initial:(T|undefined)[][],orders:number[],seed:CoefficientSeed,equationOrders:number[][]) {
    this.field=field;this.names=names;this.equations=equations;this.initial=initial;this.orders=orders;this.seed=seed;this.equationOrders=equationOrders;this.checked=equations.map(()=>0);
    if(!names.length||names.length>MAX_SYSTEM_UNKNOWNS||equations.length!==names.length)throw new Error('微積分系の未知数と方程式の個数を揃えてください。');
  }
  private initialize():void {
    if(this.coefficients)return;
    const f=this.field,constants=this.initial.map(values=>values[0]);
    this.seed.degree=undefined;
    for(let pass=0;pass<=this.names.length;pass++) {
      const constraints=this.equations.map(eq=>eq.affine(constants)).filter(eq=>eq!==undefined);
      const solved=linearSolve(f,constraints.map(eq=>eq.coefficients),constraints.map(eq=>f.sub(f.zero,eq.constant)),this.names.length);
      let changed=false;
      solved.values.forEach((value,i)=>{if(constants[i]===undefined&&value!==undefined){constants[i]=value;changed=true;}});
      if(!changed)break;
    }
    this.names.forEach((name,i)=>{
      if(constants[i]===undefined)throw new Error(`${name} の定数項が必要です。初期値を指定してください。`);
      for(let k=1;k<this.orders[i]!;k++)if(this.initial[i]![k]===undefined)throw new Error(`${name} は${this.orders[i]}階なので初期係数をseq(a0,…,a${this.orders[i]!-1})で指定してください。係数は微分値をk!で割った値です。`);
    });
    this.coefficients=this.initial.map((values,i)=>values.length?[...values] as T[]:[constants[i]!]);
    this.coefficients.forEach((values,i)=>{values[0]=constants[i]!;});
  }
  solve(precision:number):Series<T>[] {
    if(!Number.isInteger(precision)||precision<1||precision>MAX_INTERNAL_PRECISION)throw new Error('微積分系に必要な内部精度が512を超えます。');
    this.initialize();const f=this.field;
    if(this.precision>=precision)return this.coefficients!.map(row=>new Series(f,row.slice(0,precision)));
    // 失敗した延長で既存キャッシュの確定係数を変更しない。
    const values=this.coefficients!.map(row=>[...row]);
    const checked=[...this.checked];
    for(let degree=Math.min(...checked);degree<precision;degree++) {
      this.seed.degree=degree;
      const active=this.names.map((_,i)=>i).filter(i=>degree+this.orders[i]!<precision&&values[i]!.length<=degree+this.orders[i]!);
      const rows=this.equations.map((_,i)=>i).filter(i=>checked[i]!<=degree&&this.equationOrders[i]!.every((order,j)=>degree+order<precision||values[j]!.length>degree+order));
      const approximation=()=>values.map((row,i)=>new Series(f,Array.from({length:Math.min(MAX_INTERNAL_PRECISION,degree+this.orders[i]!+1)},(_,k)=>row[k]??f.zero)));
      if(degree===0&&active.length&&rows.some(i=>this.equations[i]!.affine(values.map(row=>row[0]))===undefined))throw new Error('最高階微分の定数係数に非線形な未確定値があります。最高階の初期係数もseq(...)で指定するか、最高階微分に線形な形にしてください。');
      const evaluated=rows.map(i=>this.equations[i]!.run(approximation(),degree+1,true));
      const matrix=evaluated.map(eq=>active.map(i=>eq.derivatives[i]!.at(degree)));
      const rhs=evaluated.map(eq=>f.sub(f.zero,eq.value.at(degree)));
      let solved:ReturnType<typeof linearSolve<T>>;
      try{solved=linearSolve(f,matrix,rhs,active.length);}catch{throw new Error(`次数${degree}の微積分系が矛盾しています。初期係数・係数体・方程式を確認してください。`);}
      if(solved.rank!==active.length)throw new Error(`次数${degree}で最高階微分の係数行列が特異です。解の存在・一意性をこの方法では判定できません。`);
      active.forEach((i,j)=>{values[i]!.push(solved.values[j]!);});
      const residual=rows.map(i=>this.equations[i]!.run(approximation(),degree+1,false).value);
      if(residual.some(eq=>!f.equal(eq.at(degree),f.zero)))throw new Error(`次数${degree}の微積分系の残差が0になりません。未対応の非線形な最高階微分または初期係数の不一致です。`);
      rows.forEach(i=>{checked[i]=degree+1;});
    }
    this.coefficients=values;this.precision=precision;checked.forEach((n,i)=>{this.checked[i]=n;});
    return values.map(row=>new Series(f,row.slice(0,precision)));
  }
}
