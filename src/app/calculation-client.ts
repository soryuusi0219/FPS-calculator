import type { Calculation, CalculationResult, EquationSystemResult, RowResult } from '../model/calculation.ts';

export interface CalculationSnapshot {
  busy: boolean;
  rows: ReadonlyMap<string, RowResult>;
  error: string | undefined;
  systems?: readonly EquationSystemResult[];
}
export type CalculationWorker = Pick<Worker, 'onmessage' | 'onerror' | 'postMessage' | 'terminate'>;
interface ClientOptions {
  createWorker?: () => CalculationWorker;
  debounceMs?: number;
  timeoutMs?: number;
}

/** 入力更新による中断・古い応答の破棄・時間上限を一か所で管理する。 */
export class CalculationClient {
  private worker: CalculationWorker | null = null;
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private rows: ReadonlyMap<string, RowResult> = new Map();
  private systems: EquationSystemResult[] = [];
  private readonly notify: (snapshot: CalculationSnapshot) => void;
  private readonly options: Required<ClientOptions>;

  constructor(notify: (snapshot: CalculationSnapshot) => void, options: ClientOptions = {}) {
    this.notify = notify;
    this.options = {
      createWorker: () => new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' }),
      debounceMs: 200, timeoutMs: 4000, ...options,
    };
  }
  private stopWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    clearTimeout(this.deadline);
  }
  cancel(): void {
    this.generation++;
    clearTimeout(this.debounce);
    this.stopWorker();
  }
  request(input: Calculation): void {
    this.cancel();
    const generation = this.generation;
    this.notify({ busy: true, rows: this.rows, systems: this.systems, error: undefined });
    this.debounce = setTimeout(() => {
      const finish = (response: CalculationResult) => {
        if (generation !== this.generation) return;
        this.generation++; // 同じWorkerが完了後に送る応答も採用しない。
        this.stopWorker();
        this.rows = new Map(response.rows.map((row) => [row.id, row]));
        this.systems = response.systems ?? [];
        this.notify({ busy: false, rows: this.rows, systems: this.systems, error: response.error });
      };
      try {
        this.worker = this.options.createWorker();
        this.worker.onmessage = (event: MessageEvent<CalculationResult>) => finish(event.data);
        this.worker.onerror = () => finish({ rows: [], error: '計算Workerを起動できませんでした。ページを再読み込みしてください。' });
        this.deadline = setTimeout(() => finish({ rows: [], error: '計算が4秒を超えたため中断しました。項数や式を小さくしてください。' }), this.options.timeoutMs);
        this.worker.postMessage(input);
      } catch { finish({ rows: [], error: 'このブラウザでは計算Workerを利用できません。' }); }
    }, this.options.debounceMs);
  }
}
