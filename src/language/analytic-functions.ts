import type { AnalyticFunction, AnalyticKernel } from '../core/analytic-coefficients.ts';
import type { Expression } from './parser.ts';

export const isAnalyticKernel = (name: AnalyticFunction): name is AnalyticKernel => ['sin','cos','sinh','cosh','arcsin','arctan','arcsinh','arctanh'].includes(name);
const integer = (value: bigint): Expression => ({kind:'integer',value});
const call = (name: string, arg: Expression): Expression => ({kind:'call',callee:{kind:'symbol',name},args:[arg]});
const binary = (operator: '+' | '-' | '*' | '/', left: Expression, right: Expression): Expression => ({kind:'binary',operator,left,right});

/** 導出関数は通常の演算へ展開し、Laurentの追加精度も既存の評価規則へ渡す。 */
export function analyticExpansion(name: AnalyticFunction, arg: Expression): Expression | undefined {
  const one=integer(1n),two=integer(2n);
  switch (name) {
    case 'tan': return binary('/',call('sin',arg),call('cos',arg));
    case 'cot': return binary('/',call('cos',arg),call('sin',arg));
    case 'sec': return call('inv',call('cos',arg));
    case 'csc': return call('inv',call('sin',arg));
    case 'tanh': return binary('/',call('sinh',arg),call('cosh',arg));
    case 'coth': return binary('/',call('cosh',arg),call('sinh',arg));
    case 'sech': return call('inv',call('cosh',arg));
    case 'csch': return call('inv',call('sinh',arg));
    case 'arccos': return binary('*',two,call('arcsin',call('sqrt',binary('/',binary('-',one,arg),two))));
    case 'arccosh': return binary('*',two,call('arcsinh',call('sqrt',binary('/',binary('-',arg,one),two))));
    case 'arccot': return call('arctan',call('inv',arg));
    case 'arccsc': return call('arcsin',call('inv',arg));
    case 'arcsec': return call('arccos',call('inv',arg));
    case 'arccoth': return call('arctanh',call('inv',arg));
    case 'arccsch': return call('arcsinh',call('inv',arg));
    case 'arcsech': return call('arccosh',call('inv',arg));
    default: return;
  }
}
