import type { Field } from '../core/field.ts';
import { CoefficientAlgebra } from '../core/coefficient-series.ts';
import type { CoefficientSeries } from '../core/coefficient-series.ts';
import { MAX_AGGREGATE_TERMS, MAX_EVALUATION_STEPS, MAX_INTEGER_EXPONENT } from '../config/limits.ts';
import { Evaluator } from './evaluator.ts';
import type { Expression } from './parser.ts';
import type { Lambda, Scalar, Scope, Value } from './values.ts';
import { builtinDefinition, validateBuiltinArity } from './builtins.ts';
import { degreeRange } from './degree-range.ts';
import { infiniteBound, infiniteLast } from './infinite-bound.ts';
import { egfWeights } from '../core/analytic-coefficients.ts';
import { analyticExpansion, isAnalyticKernel } from './analytic-functions.ts';

interface CoefficientCompiler<T> { (node: Expression): CoefficientSeries<T>; validate(): void }

interface Context<T> {
  field: Field<T>;
  names: readonly string[];
  definitions: ReadonlyMap<string, Expression>;
  coefficient(name: string, degree: number): T;
  external(name: string, precision: number): Value<T> | undefined;
}

/** 非局所な演算を点ごとのJacobianへ押し込まず、必要な係数への参照として構築する。 */
export function causalCompiler<T>(context: Context<T>): CoefficientCompiler<T> {
  const f=context.field, algebra=new CoefficientAlgebra(f);
  const evaluator=new Evaluator(f,name=>{
    const node=context.definitions.get(name);if(!node)throw new Error(`未定義の変数: ${name}`);return node;
  },(name,n)=>context.names.includes(name)?{kind:'history',coefficient:k=>scalar(context.coefficient(name,k))}:context.external(name,n));
  const scalar=(value:T):Scalar<T>=>({kind:'scalar',value,exact:f.asRational(value)});
  const index=(n:number)=>evaluator.evaluate({kind:'integer',value:BigInt(n)},1);
  const integer=(node:Expression,scope:Scope<T>):number=>{
    const value=evaluator.evaluate(node,1,scope);
    if(value.kind!=='scalar'||value.exact.denominator!==1n)throw new Error('次数・添字には整数のスカラーが必要です。');
    if(value.exact.numerator < -BigInt(MAX_INTEGER_EXPONENT)||value.exact.numerator>BigInt(MAX_INTEGER_EXPONENT))throw new Error('次数・添字の上限を超えました。');
    return Number(value.exact.numerator);
  };
  const condition=(node:Expression,scope:Scope<T>):boolean=>{
    const value=evaluator.evaluate(node,1,scope);if(value.kind!=='boolean')throw new Error('条件には真偽値が必要です。');return value.value;
  };
  const invoke=(lambda:Lambda<T>,args:Value<T>[],extra:Scope<T>=new Map()):Value<T>=>{
    if(lambda.parameters.length!==args.length)throw new Error('ラムダの引数数が不正です。');
    const locals=new Map([...extra,...lambda.scope]);lambda.parameters.forEach((name,i)=>locals.set(name,args[i]!));
    return evaluator.evaluate(lambda.body,1,locals);
  };
  const requireScalar=(value:Value<T>):Scalar<T>=>{if(value.kind!=='scalar')throw new Error('係数にはスカラーが必要です。');return value;};
  const rootScope=new Map<string,Value<T>>(context.names.map(name=>[name,{kind:'history',coefficient:k=>scalar(context.coefficient(name,k))}]));
  const caches=new WeakMap<Scope<T>,Map<Expression,CoefficientSeries<T>>>();
  let steps=0;
  function compile(node:Expression,scope:Scope<T>=rootScope):CoefficientSeries<T> {
    if(++steps>MAX_EVALUATION_STEPS)throw new Error('係数式の展開サイズが上限を超えました。');
    let cache=caches.get(scope);if(!cache){cache=new Map();caches.set(scope,cache);}
    if(cache.has(node))return cache.get(node)!;
    const child=(arg:Expression)=>compile(arg,scope);
    const evaluate=(arg:Expression,n=1)=>evaluator.evaluate(arg,n,scope);
    const known=()=>algebra.series(0,n=>{
      const value=evaluate(node,n+1);
      if(value.kind==='scalar')return n===0?value.value:f.zero;
      if(value.kind!=='fps')throw new Error('係数逐次系にはスカラーまたは通常FPSが必要です。');
      return value.series.asPowerSeries().at(n);
    });
    let result:CoefficientSeries<T>;
    if(node.kind==='integer')result=algebra.constant(f.fromInteger(node.value));
    else if(node.kind==='symbol') {
      const local=scope.get(node.name);
      if(local?.kind==='history')result=algebra.series(0,n=>local.coefficient(n).value);
      else if(local)result=known();
      else if(node.name==='x'||node.name==='X')result=algebra.monomial(1,f.one);
      else if(context.definitions.has(node.name))result=child(context.definitions.get(node.name)!);
      else result=known();
    } else if(node.kind==='unary'&&node.operator==='-')result=algebra.neg(child(node.operand));
    else if(node.kind==='binary'&&['+','-','*','/','^'].includes(node.operator)) {
      if(node.operator==='^') {
        const power=evaluate(node.right);
        if(power.kind!=='scalar')throw new Error('循環の係数逐次法ではべき指数にスカラーが必要です。');
        if(power.exact.denominator===1n)result=algebra.pow(child(node.left),integer(node.right,scope));
        else if(power.exact.denominator===2n) {
          const numerator=power.exact.numerator;
          if(numerator < -BigInt(MAX_INTEGER_EXPONENT)||numerator>BigInt(MAX_INTEGER_EXPONENT))throw new Error('整数の指数が上限を超えました。');
          result=algebra.pow(algebra.sqrt(child(node.left)),Number(numerator));
        }
        else result=algebra.exp(algebra.mul(algebra.constant(power.value),algebra.log(child(node.left))));
      } else {
        const a=child(node.left),b=child(node.right);
        result=node.operator==='+'||node.operator==='-'?algebra.add(a,b,node.operator==='-'):node.operator==='/'?algebra.div(a,b):algebra.mul(a,b);
      }
    } else if(node.kind==='conditional') {
      // 次数に依存する条件は係数抽出時に選ぶ。
      result=algebra.series(0,n=>child(condition(node.condition,scope)?node.yes:node.no).at(n));
    } else if(node.kind==='index'||node.kind==='factorial')result=algebra.series(0,n=>n===0?requireScalar(evaluate(node)).value:f.zero);
    else if(node.kind==='call') {
      const name=node.callee.kind==='symbol'?node.callee.name:'';
      if(builtinDefinition(name))validateBuiltinArity(name,node.args.length);
      const analytic=builtinDefinition(name)?.analytic;
      const arg=node.args[0]!;
      if(analytic) {
        if(isAnalyticKernel(analytic))result=algebra.analytic(child(arg),analytic);
        else {
          const expanded=child(analyticExpansion(analytic,arg)!);
          if(analytic==='arccos'||analytic==='arccosh')result=algebra.series(0,n=>{
            if(!f.equal(child(arg).at(0),f.one))throw new Error(`${name}(f) は f(0)=1 の枝に対応します。係数体外の定数を必要とする枝は未対応です。`);
            return expanded.at(n);
          });
          else result=expanded;
        }
      }
      else if(name==='if')result=algebra.series(0,n=>child(condition(arg,scope)?node.args[1]!:node.args[2]!).at(n));
      else if(name==='compose')result=algebra.compose(child(arg),child(node.args[1]!));
      else if(name==='diff')result=algebra.derivative(child(arg));
      else if(name==='integral')result=algebra.integral(child(arg));
      else if(name==='exp')result=algebra.exp(child(arg));
      else if(name==='log')result=algebra.log(child(arg));
      else if(name==='inv')result=algebra.inv(child(arg));
      else if(name==='sqrt')result=algebra.sqrt(child(arg));
      else if(name==='revert')result=algebra.revert(child(arg));
      else if(name==='eulerTransform')result=algebra.euler(child(arg));
      else if(name==='fps'||name==='egf') {
        const lambda=evaluate(arg);
        const weight=name==='egf'?egfWeights(f):(_n:number,a:T)=>a;
        if(lambda.kind!=='lambda') {
          if(node.args.length!==1)throw new Error(`${name} の次数範囲はラムダ生成の場合に指定してください。`);
          result=lambda.kind==='scalar'?child(arg):algebra.series(child(arg).order,n=>weight(n,child(arg).at(n)));
        } else {
          if(lambda.parameters.length!==1)throw new Error('fps のラムダは次数を受け取る1引数にしてください。');
          const [start,end]=degreeRange(node.args,node=>BigInt(integer(node,scope)));
          result=algebra.series(start,n=>n>end?f.zero:weight(n,requireScalar(invoke(lambda,[index(n)])).value));
        }
      } else if(name==='sum'||name==='prod')result=aggregate(node.args,name==='prod',scope);
      else if(name==='map') {
        const source=child(arg),transform=node.args[1]!;
        let lambda:Lambda<T>|undefined;
        if(transform.kind==='lambda'||transform.kind==='symbol'&&!['a','n','i'].includes(transform.name)) {
          const value=evaluate(transform);if(value.kind==='lambda')lambda=value;
        }
        if(lambda&&![1,2].includes(lambda.parameters.length))throw new Error('map のラムダは1〜2引数にしてください。');
        result=algebra.series(0,n=>{
          const a=scalar(source.at(n));a.coefficient=k=>scalar(source.at(k));
          const at=index(n),extra=new Map<string,Value<T>>([['a',a],['n',at],['i',at]]);
          return requireScalar(lambda?invoke(lambda,lambda.parameters.length===1?[at]:[a,at],extra):evaluator.evaluate(transform,1,new Map([...scope,...extra]))).value;
        });
      } else if(name==='coeff')result=algebra.series(0,n=>n===0?child(arg).at(integer(node.args[1]!,scope)):f.zero);
      else if(name==='hadamard') {const a=child(arg),b=child(node.args[1]!);result=algebra.series(Math.max(a.order,b.order),n=>f.mul(a.at(n),b.at(n)));}
      else if(name==='partialSums')result=algebra.mul(child(arg),algebra.inv(algebra.add(algebra.constant(f.one),algebra.series(1,n=>n===1?f.one:f.zero),true)));
      else if(!builtinDefinition(name)&&node.args.length===1) {
        // FPSの呼出し f(g) はcomposeの短縮形。ラムダは既存の展開後にも残り得る。
        let lambda:Value<T>|undefined;
        if(node.callee.kind==='lambda'||node.callee.kind==='symbol'&&context.definitions.get(name)?.kind==='lambda')lambda=evaluate(node.callee);
        result=lambda?.kind==='lambda'?compile(lambda.body,new Map([...lambda.scope,[lambda.parameters[0]!,evaluate(arg)] as [string,Value<T>]])):algebra.compose(child(node.callee),child(arg));
      } else result=known();
    } else result=known();
    cache.set(node,result);return result;
  }
  function aggregate(args:Expression[],product:boolean,scope:Scope<T>):CoefficientSeries<T> {
    const start=integer(args[0]!,scope),infinite=args.length===2;
    const lambda=evaluator.evaluate(args.at(-1)!,1,scope);
    if(lambda.kind!=='lambda'||lambda.parameters.length!==1)throw new Error('総和・総積には1引数のラムダが必要です。');
    if(infinite&&start<0)throw new Error('無限演算の開始添字は非負にしてください。');
    const end=infinite?undefined:integer(args[1]!,scope);
    const terms=new Map<number,CoefficientSeries<T>>();
    const products=new Map<string,CoefficientSeries<T>>();
    const term=(k:number)=>{
      if(!terms.has(k))terms.set(k,compile(lambda.body,new Map([...lambda.scope,[lambda.parameters[0]!,index(k)] as [string,Value<T>]])));
      return terms.get(k)!;
    };
    const rangeProduct=(lo:number,hi:number):CoefficientSeries<T>=>{
      if(lo>hi)return algebra.constant(f.one);
      if(lo===hi)return term(lo);
      const key=`${lo}:${hi}`;
      if(!products.has(key)) {
        const count=hi-lo+1,left=2**Math.floor(Math.log2(count-1));
        products.set(key,algebra.mul(rangeProduct(lo,lo+left-1),rangeProduct(lo+left,hi)));
      }
      return products.get(key)!;
    };
    let bound:ReturnType<typeof infiniteBound>|undefined;
    return algebra.series(0,n=>{
      if(infinite&&!bound)bound=infiniteBound(lambda.body,lambda.parameters[0]!,start,product,{
        integer:node=>integer(node,lambda.scope),
        order:node=>{const series=compile(node,lambda.scope);return series.order>0?series.order:f.equal(series.at(0),f.zero)?1:0;},
      });
      const last=end??infiniteLast(start,n+1,bound!);
      if(last-start+1>MAX_AGGREGATE_TERMS)throw new Error(`総和・総積は${MAX_AGGREGATE_TERMS}項までです。`);
      if(!product) {
        let value=f.zero;
        for(let k=start;k<=last;k++)value=f.add(value,term(k).at(n));
        return value;
      }
      // 固定された区間の積を再利用し、長い左結合による深い再帰を避ける。
      return rangeProduct(start,last).at(n);
    });
  }
  return Object.assign((node:Expression)=>compile(node),{validate:()=>algebra.validateDomains()});
}

/** 明示系も左辺が未知数1つの定義に整理できる場合だけ、この解法の候補にする。 */
export function causalDefinitions(equations: readonly Expression[],names:readonly string[]): Expression[] | undefined {
  const definitions=new Map<string,Expression>();
  for(const equation of equations) {
    if(equation.kind!=='binary'||equation.operator!=='-')return;
    const {left,right}=equation;
    if(left.kind!=='symbol'||!names.includes(left.name)||definitions.has(left.name))return;
    definitions.set(left.name,right);
  }
  return names.every(name=>definitions.has(name))?names.map(name=>definitions.get(name)!):undefined;
}

export function hasCausalOperators(equations: readonly Expression[]): boolean {
  const visit=(node:Expression):boolean=>{
    if(node.kind==='call')return node.callee.kind!=='symbol'||['sum','prod','compose','map','fps','egf','revert','eulerTransform'].includes(node.callee.name)||!!builtinDefinition(node.callee.name)?.analytic||!builtinDefinition(node.callee.name)||node.args.some(visit);
    if(node.kind==='binary')return visit(node.left)||visit(node.right);
    if(node.kind==='unary'||node.kind==='factorial')return visit(node.operand);
    if(node.kind==='conditional')return visit(node.condition)||visit(node.yes)||visit(node.no);
    if(node.kind==='index')return true;
    return false;
  };
  return equations.some(visit);
}
