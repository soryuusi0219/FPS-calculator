import { Series } from './series.ts';
import { kernelCoefficient } from './analytic-coefficients.ts';
import type { AnalyticKernel } from './analytic-coefficients.ts';

export function analyticSeries<T>(input: Series<T>, name: AnalyticKernel, derivative=false): Series<T> {
  const field=input.field,n=input.precision;
  if(!field.equal(input.at(0),field.zero))throw new Error(`${name}(f) は f(0)=0 の場合に対応しています。一般の超越定数は現在の係数体で表せません。`);
  const first=input.coefficients.findIndex(value=>!field.equal(value,field.zero));
  const order=first<0?n:first;
  const maximum=Math.floor((n-1)/order);
  const coefficients=Array<T>(n).fill(field.zero);
  for(let k=0;k<=maximum;k++)coefficients[k]=kernelCoefficient(field,name,k,derivative);
  return new Series(field,coefficients).compose(input);
}
