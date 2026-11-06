import type { Field } from '../core/field.ts';
import { Series } from '../core/series.ts';
import { catalanSeries, lambertW } from '../core/special-series.ts';
import { MAX_EVALUATION_STEPS, MAX_INTEGER_EXPONENT } from '../config/limits.ts';
import type { Value } from './values.ts';
import type { Expression } from './parser.ts';
import { freeSymbols } from './dependencies.ts';
import type { CoefficientSeed } from '../core/differential-system.ts';
import { builtinDefinition, validateBuiltinArity } from './builtins.ts';
import type { Affine, ImplicitExpression, Jet } from '../core/implicit-types.ts';
interface Context<T> {
  differential?: { seed: CoefficientSeed; orders: number[]; initial: (T | undefined)[][] };
  field: Field<T>; names: string[]; definitions: ReadonlyMap<string, Expression>;
  evaluate(expression: Expression, precision: number): Value<T>;
}

/** 未知級数に関して点ごとに形式展開できる演算だけをコンパイルし、値と偏微分を同時評価する。 */
export function implicitCompiler<T>(context: Context<T>): (node: Expression) => ImplicitExpression<T> {
  const { field: f, names } = context;
  let steps = 0;
  const compiled = new WeakMap<Expression, ImplicitExpression<T>>();
  const known = (constant: T): Affine<T> => ({ constant, coefficients: names.map(() => f.zero) });
  const isConstant = (value: Affine<T>) => value.coefficients.every((a) => f.equal(a, f.zero));
  const zero = (n: number) => Series.constant(f, f.zero, n);
  const one = (n: number) => Series.constant(f, f.one, n);
  function depends(node: Expression, seen = new Set<string>()): boolean {
    for (const name of freeSymbols(node)) {
      if (names.includes(name)) return true;
      if (seen.has(name)) continue;
      seen.add(name);
      const definition = context.definitions.get(name);
      if (definition && depends(definition, seen)) return true;
    }
    return false;
  }
  const jet = (value: Series<T>, derivative: Series<T>[], multiplier: Series<T>): Jet<T> => ({ value, derivatives: derivative.map((d) => d.mul(multiplier)) });
  function unary(name: string, a: Jet<T>): Jet<T> {
    const n = a.value.precision;
    if (name === 'neg') return { value: a.value.neg(), derivatives: a.derivatives.map((d) => d.neg()) };
    if (name === 'fps') return a;
    if (name === 'exp') { const value = a.value.exp(); return jet(value, a.derivatives, value); }
    if (name === 'log') return jet(a.value.log(), a.derivatives, a.value.inv());
    if (name === 'inv') { const value = a.value.inv(); return jet(value, a.derivatives, value.mul(value).neg()); }
    if (name === 'sqrt') {
      if (f.equal(a.value.at(0), f.zero)) throw new Error('未知級数のsqrtには非零の定数項が必要です。特異な枝は未対応です。');
      const value = a.value.sqrt();
      return jet(value, a.derivatives, value.add(value).inv());
    }
    if (name === 'Catalan') {
      const value = catalanSeries(f, n).compose(a.value);
      const twice = value.mul(a.value).mul(Series.constant(f, f.fromInteger(2n), n));
      return jet(value, a.derivatives, value.mul(value).div(one(n).sub(twice)));
    }
    if (name === 'LambertW') {
      const value = lambertW(a.value);
      if (!a.derivatives.length) return { value, derivatives: [] };
      return jet(value, a.derivatives, value.neg().exp().div(one(n).add(value)));
    }
    throw new Error(`未知級数に対する ${name} は未対応です。微分・合成・map・係数抽出などを介した循環は解けません。`);
  }
  function binary(operator: string, a: Jet<T>, b: Jet<T>): Jet<T> {
    if (operator === '+' || operator === '-') return { value: operator === '+' ? a.value.add(b.value) : a.value.sub(b.value), derivatives: a.derivatives.map((d, i) => operator === '+' ? d.add(b.derivatives[i]!) : d.sub(b.derivatives[i]!)) };
    if (operator === '*') return { value: a.value.mul(b.value), derivatives: a.derivatives.map((d, i) => d.mul(b.value).add(a.value.mul(b.derivatives[i]!))) };
    if (operator === '/') return binary('*', a, unary('inv', b));
    throw new Error(`未知級数に対する演算 ${operator} は未対応です。`);
  }
  function combination(args: ImplicitExpression<T>[], operation: (values: Jet<T>[]) => Jet<T>, affine?: (values: (Affine<T> | undefined)[]) => Affine<T> | undefined): ImplicitExpression<T> {
    return {
      run(values, n, differentiate) {
        if (++steps > MAX_EVALUATION_STEPS) throw new Error('連立方程式の評価回数が上限を超えました。');
        return operation(args.map((arg) => arg.run(values, n, differentiate)));
      },
      affine(initial) {
        const values = args.map((arg) => arg.affine(initial));
        if (affine) return affine(values);
        if (values.some((a) => !a || !isConstant(a))) return;
        const value = operation(values.map((a) => ({ value: Series.constant(f, a!.constant, 1), derivatives: [] }))).value.at(0);
        return known(value);
      },
    };
  }
  function arithmetic(operator: string, a: ImplicitExpression<T>, b: ImplicitExpression<T>): ImplicitExpression<T> {
    return combination([a, b], ([x, y]) => binary(operator, x!, y!), ([x, y]) => {
      if (operator === '*' && (x && isConstant(x) && f.equal(x.constant, f.zero) || y && isConstant(y) && f.equal(y.constant, f.zero))) return known(f.zero);
      if (!x || !y) return;
      if (operator === '+' || operator === '-') {
        const op = operator === '+' ? f.add : f.sub;
        return { constant: op(x.constant, y.constant), coefficients: x.coefficients.map((c, i) => op(c, y.coefficients[i]!)) };
      }
      if (operator === '*' && (isConstant(x) || isConstant(y))) return { constant: f.mul(x.constant, y.constant), coefficients: x.coefficients.map((c, i) => f.add(f.mul(c, y.constant), f.mul(x.constant, y.coefficients[i]!))) };
      if (operator === '/' && isConstant(y)) return { constant: f.div(x.constant, y.constant), coefficients: x.coefficients.map((c) => f.div(c, y.constant)) };
      return;
    });
  }
  function compile(node: Expression): ImplicitExpression<T> {
    const previous = compiled.get(node); if (previous) return previous;
    if (node.kind === 'call' && node.callee.kind === 'symbol') {
      const definition = builtinDefinition(node.callee.name);
      if (definition) validateBuiltinArity(node.callee.name, node.args.length);
    }
    let result: ImplicitExpression<T>;
    if (node.kind === 'symbol' && names.includes(node.name)) {
      const index = names.indexOf(node.name);
      result = {
        run(values, n, differentiate) {
          const degree=context.differential?.seed.degree;
          const direction=degree===undefined?one(n):new Series(f,Array.from({length:n},(_,k)=>k===degree+context.differential!.orders[index]!?f.one:f.zero));
          return {value:values[index]!.truncate(n),derivatives:differentiate?names.map((_,i)=>i===index?direction:zero(n)):[]};
        },
        affine(initial) { return initial[index] === undefined ? { constant: f.zero, coefficients: names.map((_, i) => i === index ? f.one : f.zero) } : known(initial[index]!); },
      };
    } else if (!depends(node)) {
      const cache = new Map<number, Series<T>>();
      const read = (n: number) => {
        if (cache.has(n)) return cache.get(n)!;
        const value = context.evaluate(node, n);
        const series = value.kind === 'scalar' ? Series.constant(f, value.value, n) : value.kind === 'fps' ? value.series.asPowerSeries().truncate(n) : null;
        if (!series) throw new Error('方程式の係数にはスカラーまたは通常FPSが必要です。');
        cache.set(n, series); return series;
      };
      result = { run(_values, n, differentiate) { return { value: read(n), derivatives: differentiate ? names.map(() => zero(n)) : [] }; }, affine() { return known(read(1).at(0)); } };
    } else if (node.kind === 'symbol') {
      const definition = context.definitions.get(node.name);
      if (!definition) throw new Error(`未定義の変数: ${node.name}`);
      result = compile(definition);
    } else if (node.kind === 'call' && node.callee.kind === 'symbol' && ['diff','integral'].includes(node.callee.name) && context.differential) {
      const name=node.callee.name, child=compile(node.args[0]!);
      result = {
        run(values,n,differentiate) {
          if(name==='integral'&&n===1)return {value:zero(1),derivatives:differentiate?names.map(()=>zero(1)):[]};
          const value=child.run(values,name==='diff'?n+1:Math.max(1,n-1),differentiate);
          const apply=(a:Series<T>)=>name==='diff'?a.derivative():a.integral().truncate(n);
          return {value:apply(value.value),derivatives:value.derivatives.map(apply)};
        },
        affine() {
          if(name==='integral')return known(f.zero);
          if(context.differential!.seed.degree!==0)return;
          let atom:Expression=node,order=0;
          while(atom.kind==='call'&&atom.callee.kind==='symbol'&&atom.callee.name==='diff'&&atom.args.length===1){order++;atom=atom.args[0]!;}
          if(atom.kind!=='symbol'||!names.includes(atom.name))return;
          const i=names.indexOf(atom.name),initial=context.differential!.initial[i]!;
          let factor=f.one;for(let k=1;k<=order;k++)factor=f.mul(factor,f.fromInteger(BigInt(k)));
          if(initial[order]!==undefined)return known(f.mul(factor,initial[order]!));
          if(order!==context.differential!.orders[i])return;
          return {constant:f.zero,coefficients:names.map((_,j)=>i===j?factor:f.zero)};
        },
      };
    } else if (node.kind === 'unary' && node.operator === '-') {
      result = combination([compile(node.operand)], ([a]) => unary('neg', a!), ([a]) => a ? { constant: f.sub(f.zero, a.constant), coefficients: a.coefficients.map((c) => f.sub(f.zero, c)) } : undefined);
    } else if (node.kind === 'binary' && ['+', '-', '*', '/'].includes(node.operator)) {
      result = arithmetic(node.operator, compile(node.left), compile(node.right));
    } else if (node.kind === 'binary' && node.operator === '^') {
      const a = compile(node.left);
      const exponent = depends(node.right) ? null : context.evaluate(node.right, 1);
      if (exponent?.kind === 'scalar' && exponent.exact.denominator === 1n) {
        const k = Number(exponent.exact.numerator);
        if (!Number.isSafeInteger(k) || Math.abs(k) > MAX_INTEGER_EXPONENT) throw new Error('整数の指数が上限を超えました。');
        const operation = ([base]: Jet<T>[]) => {
          const value = base!.value.pow(k);
          if (!base!.derivatives.length) return { value, derivatives: [] };
          const multiplier = k === 0 ? zero(value.precision) : (k < 0 ? value.mul(base!.value.inv()) : base!.value.pow(k - 1)).mul(Series.constant(f, f.fromInteger(BigInt(k)), value.precision));
          return jet(value, base!.derivatives, multiplier);
        };
        result = combination([a], operation, ([value]) => k === 0 ? known(f.one) : k === 1 ? value : value && isConstant(value) ? known(Series.constant(f, value.constant, 1).pow(k).at(0)) : undefined);
      } else {
        result = combination([a, compile(node.right)], ([base, power]) => unary('exp', binary('*', power!, unary('log', base!))));
      }
    } else if (node.kind === 'conditional' || node.kind === 'call' && node.callee.kind === 'symbol' && node.callee.name === 'if') {
      const condition = node.kind === 'conditional' ? node.condition : node.args[0]!;
      if (depends(condition)) throw new Error('未知級数に依存する条件分岐は未対応です。');
      const value = context.evaluate(condition, 1);
      if (value.kind !== 'boolean') throw new Error('条件には真偽値が必要です。');
      result = compile(node.kind === 'conditional' ? value.value ? node.yes : node.no : node.args[value.value ? 1 : 2]!);
    } else if (node.kind === 'call' && node.callee.kind === 'symbol' && ['exp', 'log', 'inv', 'sqrt', 'fps', 'Catalan', 'LambertW'].includes(node.callee.name) && node.args.length === 1 && node.args[0]!.kind !== 'lambda') {
      const name = node.callee.name;
      result = combination([compile(node.args[0]!)], ([a]) => unary(name, a!));
    } else throw new Error('未知級数の微分・積分・合成・map・係数抽出・再帰ラムダを介した循環は未対応です。');
    compiled.set(node, result); return result;
  }
  return compile;
}
