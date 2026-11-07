import type { Calculation, EquationSystemInput, InputRow } from '../../model/calculation.ts';

export const templateCategories = [
  { id: 'combinatorics', label: '組合せ論' }, { id: 'recurrences', label: '漸化式' },
  { id: 'trees', label: '木' }, { id: 'graphs', label: 'グラフ' }, { id: 'systems', label: '連立系' },
] as const;
export interface NotebookTemplate {
  id: string; title: string; description: string;
  category: typeof templateCategories[number]['id'];
  document: unknown;
}
type Row = Omit<InputRow,'id'|'comment'> & {comment:string};
interface Options {
  terms?:number; basis?:Calculation['basis']; domain?:Calculation['domain']; modulus?:string;
  systems?:Omit<EquationSystemInput,'id'>[];
  primary?:number;
}
export const row=(source:string,comment:string,initial?:string):Row=>({source,comment,...(initial===undefined?{}:{initial})});
export const check=(source:string,comment='指定精度で差が0になることを確認します。有限の係数一致だけを恒等性の証明とはしません。'):Row=>row(source,comment);
export function sample(id:string,title:string,category:NotebookTemplate['category'],description:string,rows:Row[],options:Options={}):NotebookTemplate {
  const primary=options.primary??0;
  if(!Number.isInteger(primary)||primary<0||primary>=rows.length)throw new Error(`サンプル${id}の代表行が不正です。`);
  const ordered=[rows[primary]!,...rows.filter((_,i)=>i!==primary)];
  return {id,title,category,description,document:{format:'fps-calculator',version:1,view:'table',data:{
    rows:ordered,terms:options.terms??12,domain:options.domain??'rational',modulus:options.modulus??'998244353',basis:options.basis??'ogf',
    ...(options.systems?{systems:options.systems}:{}),
  }}};
}
export const graphSource='出典: https://maspypy.com/グラフ数え上げ 。ループ・多重辺なし。期待値と符号は組合せ分解・既知項でも照合しています。';
