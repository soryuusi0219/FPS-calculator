import { calculate } from './workbook.ts';
import type { Calculation } from './model/calculation.ts';

// bigintはWorker内で計算し、UIには表示用文字列だけを返す。
self.onmessage = (event: MessageEvent<Calculation>) => {
  self.postMessage(calculate(event.data));
};
