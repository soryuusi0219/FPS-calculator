import type { Expression } from './parser.ts';
import { freeSymbols } from './dependencies.ts';
import { builtinDefinition } from './builtins.ts';
import { analyticExpansion, isAnalyticKernel } from './analytic-functions.ts';

const integer=(n:bigint):Expression=>({kind:'integer',value:n});
const binary=(operator:'+'|'-'|'*'|'/'|'^',left:Expression,right:Expression):Expression=>{
  const is=(node:Expression,value:bigint)=>node.kind==='integer'&&node.value===value;
  if(operator==='*'&&(is(left,0n)||is(right,0n)))return integer(0n);
  if(operator==='*'&&is(left,1n)||operator==='+'&&is(left,0n))return right;
  if(operator==='*'&&is(right,1n)||(operator==='+'||operator==='-')&&is(right,0n))return left;
  if(operator==='^'&&is(right,0n))return integer(1n);
  if(operator==='^'&&is(right,1n))return left;
  if(left.kind==='integer'&&right.kind==='integer'&&['+','-'].includes(operator))return integer(operator==='+'?left.value+right.value:left.value-right.value);
  return {kind:'binary',operator,left,right};
};
const call=(name:string,arg:Expression):Expression=>({kind:'call',callee:{kind:'symbol',name},args:[arg]});

/** 依存する微分を和・積・連鎖律で展開し、未知関数の微分を単純なjet参照へ変換する。 */
export function normalizeDifferential(expression:Expression,names:readonly string[],condition?: (node: Expression) => boolean):Expression {
  let steps=0;
  const dependent=(node:Expression)=>[...freeSymbols(node)].some(name=>names.includes(name));
  function derivative(node:Expression):Expression {
    if(++steps>20000)throw new Error('微分の展開サイズが上限を超えました。');
    if(!dependent(node))return call('diff',node);
    if(node.kind==='symbol')return call('diff',node);
    if(node.kind==='unary'&&node.operator==='-')return { ...node,operand:derivative(node.operand) };
    if(node.kind==='binary') {
      const {left:a,right:b,operator:op}=node;
      if(op==='+'||op==='-')return binary(op,derivative(a),derivative(b));
      if(op==='*')return binary('+',binary('*',derivative(a),b),binary('*',a,derivative(b)));
      if(op==='/')return binary('/',binary('-',binary('*',derivative(a),b),binary('*',a,derivative(b))),binary('^',b,integer(2n)));
      if(op==='^'&&!dependent(b))return binary('*',binary('*',b,binary('^',a,binary('-',b,integer(1n)))),derivative(a));
    }
    if(node.kind==='call'&&node.callee.kind==='symbol'&&node.args.length===1) {
      const a=node.args[0]!,name=node.callee.name;
      if(name==='diff')return call('diff',node);
      if(name==='integral')return a;
      if(name==='fps'&&a.kind!=='lambda')return derivative(a);
      if(name==='exp')return binary('*',node,derivative(a));
      if(name==='log')return binary('/',derivative(a),a);
      if(name==='inv')return binary('/',{kind:'unary',operator:'-',operand:derivative(a)},binary('^',a,integer(2n)));
      if(name==='sqrt')return binary('/',derivative(a),binary('*',integer(2n),node));
      const analytic=builtinDefinition(name)?.analytic;
      if(analytic) {
        if(!isAnalyticKernel(analytic))return derivative(analyticExpansion(analytic,a)!);
        if(analytic==='sin'||analytic==='sinh'||analytic==='cosh')return binary('*',call(analytic==='sin'?'cos':analytic==='sinh'?'cosh':'sinh',a),derivative(a));
        if(analytic==='cos')return binary('*',{kind:'unary',operator:'-',operand:call('sin',a)},derivative(a));
        const denominator=binary(analytic==='arcsin'||analytic==='arctanh'?'-':'+',integer(1n),binary('^',a,integer(2n)));
        return binary('/',derivative(a),analytic==='arcsin'||analytic==='arcsinh'?call('sqrt',denominator):denominator);
      }
    }
    throw new Error('この未知関数の微分は未対応です。和・積・商・スカラーべき・exp/log/sqrtの微分を使ってください。');
  }
  function visit(node:Expression):Expression {
    if(++steps>20000)throw new Error('微分の展開サイズが上限を超えました。');
    if(node.kind==='conditional'&&condition&&!dependent(node.condition))return visit(condition(node.condition)?node.yes:node.no);
    if(node.kind==='call'&&node.callee.kind==='symbol'&&node.callee.name==='if'&&node.args.length===3&&condition&&!dependent(node.args[0]!))return visit(condition(node.args[0]!)?node.args[1]!:node.args[2]!);
    if(node.kind==='call') {
      const args=node.args.map(visit);
      if(node.callee.kind==='symbol'&&node.callee.name==='diff'&&args.length===1&&dependent(args[0]!))return derivative(args[0]!);
      return {...node,args};
    }
    if(node.kind==='binary')return {...node,left:visit(node.left),right:visit(node.right)};
    if(node.kind==='unary'||node.kind==='factorial')return {...node,operand:visit(node.operand)};
    if(node.kind==='index')return {...node,target:visit(node.target),index:visit(node.index)};
    if(node.kind==='conditional')return {...node,condition:visit(node.condition),yes:visit(node.yes),no:visit(node.no)};
    return node;
  }
  return visit(expression);
}
export function differentialOrders(expressions:readonly Expression[],names:readonly string[]):{orders:number[];calculus:boolean} {
  const orders=names.map(()=>0);let calculus=false;
  function visit(node:Expression,shift=0):void {
    if(node.kind==='symbol') {const i=names.indexOf(node.name);if(i>=0)orders[i]=Math.max(orders[i]!,shift);return;}
    if(node.kind==='call') {
      const name=node.callee.kind==='symbol'?node.callee.name:'';
      if((name==='diff'||name==='integral')&&[...freeSymbols(node)].some(name=>names.includes(name)))calculus=true;
      if(node.callee.kind==='symbol'&&names.includes(node.callee.name))visit(node.callee,shift);
      node.args.forEach(arg=>visit(arg,shift+(name==='diff'?1:name==='integral'?-1:0)));return;
    }
    if(node.kind==='binary'){visit(node.left,shift);visit(node.right,shift);}
    if(node.kind==='unary'||node.kind==='factorial')visit(node.operand,shift);
    if(node.kind==='index'){visit(node.target,shift);visit(node.index,shift);}
    if(node.kind==='conditional'){visit(node.condition,shift);visit(node.yes,shift);visit(node.no,shift);}
  }
  expressions.forEach(node=>visit(node));
  if(orders.some(order=>order>8))throw new Error('未知関数の微分は8階までです。');
  return {orders,calculus};
}
