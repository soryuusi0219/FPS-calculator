import { combinatorial, factorial } from '../../core/combinatorics.ts';
import { LaurentSeries } from '../../core/laurent.ts';
import { catalanSeries, lambertW } from '../../core/special-series.ts';
import { eulerTransform } from '../../core/euler-transform.ts';
import { kernelCoefficient } from '../../core/analytic-coefficients.ts';
import { analyticSeries } from '../../core/analytic-series.ts';
import type { Expression } from '../parser.ts';
import type { Scope, Value } from '../values.ts';
import { builtinDefinition, validateBuiltinArity } from '../builtins.ts';
import { sequenceBuiltin, sequenceFunctionNames } from '../sequence-functions.ts';
import { aggregate } from '../aggregate.ts';
import { analyticExpansion, isAnalyticKernel } from '../analytic-functions.ts';
import { generateSeries, mapCoefficients } from './coefficient-functions.ts';
import type { BuiltinRuntime } from './runtime.ts';

/** 引数数の検証と組み込み演算の選択。構文木の走査と名前解決はruntimeへ戻す。 */
export function evaluateBuiltin<T>(runtime: BuiltinRuntime<T>, name: string, args: Expression[], precision: number, scope: Scope<T>): Value<T> {
  const definition = builtinDefinition(name)!;
  validateBuiltinArity(name, args.length);
  if (sequenceFunctionNames.has(name)) return sequenceBuiltin({
    field: runtime.field, evaluate: (node,n) => runtime.evaluate(node,n,scope),
    integer: value => runtime.exactInteger(value), scalar: value => runtime.fromCoefficient(value), index: n => runtime.integer(BigInt(n)),
    invoke: (lambda,values,n) => runtime.invoke(lambda,values,n), lookup: name => runtime.lookup(name),
  },name,args,precision);
  const arg = args[0]!;
  const ev = (node: Expression, requested = precision) => runtime.evaluate(node, requested, scope);
  if (definition.analytic) {
    const canonical=definition.analytic;
    if(isAnalyticKernel(canonical)) {
      const value=ev(arg);
      if(value.kind==='scalar') {
        if(!runtime.field.equal(value.value,runtime.field.zero))throw new Error(`${name} のスカラー引数は0の場合のみ対応します。一般の超越定数は現在の係数体で表せません。`);
        return runtime.fromCoefficient(kernelCoefficient(runtime.field,canonical,0));
      }
      return {kind:'fps',series:new LaurentSeries(runtime.field,analyticSeries(runtime.series(value,precision,false).asPowerSeries(),canonical).coefficients)};
    }
    if(canonical==='arccos'||canonical==='arccosh') {
      const value=ev(arg,1);
      const constant=value.kind==='scalar'?value.value:runtime.series(value,1,false).asPowerSeries().at(0);
      if(!runtime.field.equal(constant,runtime.field.one))throw new Error(`${name}(f) は f(0)=1 の枝に対応します。π/2など係数体外の定数や分数次数を必要とする枝は表現できません。`);
      if(value.kind==='scalar')return runtime.integer(0n);
    }
    return ev(analyticExpansion(canonical,arg)!);
  }
  if (name === 'sum' || name === 'prod') return aggregate({
    field: runtime.field, evaluate: ev, integer: value => runtime.exactInteger(value), scalar: (exact,value) => runtime.scalar(exact,value),
    invoke: (lambda,index,n) => runtime.invoke(lambda,[runtime.integer(BigInt(index))],n),
    evaluateBody: (lambda,node,n) => runtime.evaluate(node,n,lambda.scope),
  },name === 'prod',args,precision);
  if (name === 'eulerTransform') return { kind: 'fps', series: new LaurentSeries(runtime.field,eulerTransform(runtime.series(ev(arg),precision,false).asPowerSeries()).coefficients) };
  if (name === 'if') return ev(runtime.condition(ev(arg)) ? args[1]! : args[2]!);
  if (name === 'coeff') return runtime.index(arg, runtime.exactInteger(ev(args[1]!)));
  if (name === 'sqrt') return runtime.squareRoot(arg, precision);
  if (name === 'inv') return runtime.raise((requested) => ev(arg, requested), -1n, precision);
  if (name === 'factorial') return runtime.integer(factorial(runtime.exactInteger(ev(arg))));
  if (definition.combinatorial) return runtime.integer(combinatorial(definition.combinatorial, runtime.exactInteger(ev(arg)), runtime.exactInteger(ev(args[1]!))));
  if (name === 'fps' || name === 'egf') return generateSeries(runtime, name, args, precision);
  if (name === 'map') return mapCoefficients(runtime, arg, args[1]!, precision, scope);
  if (name === 'diff') return { kind: 'fps', series: runtime.series(ev(arg, precision + 1), precision + 1).derivative() };
  if (name === 'integral') {
    const requested = Math.max(1, precision - 1);
    return { kind: 'fps', series: runtime.series(ev(arg, requested), requested).integral().truncate(precision) };
  }
  if (name === 'revert') {
    const requested = Math.max(2, precision);
    return { kind: 'fps', series: runtime.series(ev(arg, requested), requested, false).revert().truncate(precision) };
  }
  const value = ev(arg);
  if (name === 'Catalan' || name === 'LambertW') {
    if (value.kind === 'scalar') {
      if (!runtime.field.equal(value.value, runtime.field.zero)) throw new Error(`${name} のスカラー引数は0の場合のみ対応しています。`);
      return runtime.integer(name === 'Catalan' ? 1n : 0n);
    }
    const input = runtime.series(value, precision, false).asPowerSeries();
    const series = name === 'Catalan' ? catalanSeries(runtime.field, precision).compose(input) : lambertW(input);
    return { kind: 'fps', series: new LaurentSeries(runtime.field, series.coefficients) };
  }
  if (name === 'compose') return { kind: 'fps', series: runtime.series(value, precision, false).compose(runtime.series(ev(args[1]!), precision, false)) };
  if (value.kind === 'scalar') {
    if (name === 'exp' && runtime.field.equal(value.value, runtime.field.zero)) return runtime.integer(1n);
    if (name === 'log' && runtime.field.equal(value.value, runtime.field.one)) return runtime.integer(0n);
    throw new Error(`${name} のスカラー引数は${name === 'exp' ? '0' : '1'}の場合のみ対応しています。`);
  }
  const series = runtime.series(value, precision, false);
  return { kind: 'fps', series: name === 'exp' ? series.exp() : series.log() };
}
