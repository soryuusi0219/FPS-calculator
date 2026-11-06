import type { Field } from '../core/field.ts';
import { LaurentSeries } from '../core/laurent.ts';
import { DifferentialSystem } from '../core/differential-system.ts';
import { differentialOrders, normalizeDifferential } from './differential-normalize.ts';
import { ImplicitSystem } from '../core/implicit-system.ts';
import { MAX_EQUATION_GROUPS, MAX_SYSTEM_TEXT_LENGTH, MAX_SYSTEM_UNKNOWNS } from '../config/limits.ts';
import type { Calculation, EquationSystemInput, EquationSystemResult, RowResult, SolverMethod } from '../model/calculation.ts';
import { Evaluator } from './evaluator.ts';
import type { Value } from './values.ts';
import { parse, parseEquation, validDefinitionName } from './parser.ts';
import type { Expression, Statement } from './parser.ts';
import { expandCalls, freeSymbols, stronglyConnected } from './dependencies.ts';
import { implicitCompiler } from './implicit-expression.ts';

interface System { input: EquationSystemInput; names: string[]; equations: Expression[]; error?: string }
interface Group<T> { names: string[]; equations: Expression[]; method: SolverMethod; solver?: ImplicitSystem<T> | DifferentialSystem<T>; orders?: number[]; normalized?: boolean; precision: number; solving: boolean }
const lines = (source: string) => source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

/** 名前依存と明示的な方程式ブロックをSCCごとに解き、通常の評価器から必要精度で参照する。 */
export class ImplicitWorkbook<T> {
  private readonly expressions = new Map<string, Expression>();
  private readonly initial = new Map<string, Expression>();
  private readonly errors = new Map<string, string>();
  private readonly groups = new Map<string, Group<T>>();
  private readonly systems: System[] = [];
  private evaluator: Evaluator<T> | undefined;
  private readonly field: Field<T>;

  constructor(field: Field<T>, input: Calculation, statements: ReadonlyMap<string, Statement>) {
    this.field = field;
    const counts = new Map<string, number>();
    const add = (name: string) => { counts.set(name, (counts.get(name) ?? 0) + 1); };
    for (const row of input.rows) {
      const statement = statements.get(row.id);
      if (!statement?.name) continue;
      add(statement.name); this.expressions.set(statement.name, statement.expression);
    }
    if ((input.systems?.length ?? 0) > MAX_EQUATION_GROUPS) throw new Error(`方程式グループは${MAX_EQUATION_GROUPS}個までです。`);
    for (const system of input.systems ?? []) {
      const entry: System = { input: system, names: [], equations: [] };
      this.systems.push(entry);
      try {
        if (typeof system.variables !== 'string' || typeof system.equations !== 'string' || system.variables.length > MAX_SYSTEM_TEXT_LENGTH || system.equations.length > MAX_SYSTEM_TEXT_LENGTH) throw new Error(`方程式欄は${MAX_SYSTEM_TEXT_LENGTH}文字までです。`);
        if (!['auto', 'coefficient', 'newton'].includes(system.method)) throw new Error('解法の指定が不正です。');
        for (const variable of lines(system.variables)) {
          const parsed = parse(variable);
          const name = parsed.name ?? (parsed.expression.kind === 'symbol' ? parsed.expression.name : '');
          if (!validDefinitionName(name)) throw new Error('未知数は予約語以外の識別子で指定してください。例: u = 1');
          entry.names.push(name); add(name);
          if (parsed.name) this.initial.set(name, parsed.expression);
        }
        if (!entry.names.length || entry.names.length > MAX_SYSTEM_UNKNOWNS) throw new Error(`未知数は1〜${MAX_SYSTEM_UNKNOWNS}個にしてください。`);
        entry.equations = lines(system.equations).map(parseEquation);
        if (entry.equations.length !== entry.names.length) throw new Error(`未知数${entry.names.length}個に対して方程式が${entry.equations.length}本あります。同じ個数にしてください。`);
      } catch (error) { entry.error = errorText(error); for (const name of entry.names) this.errors.set(name, entry.error); }
    }
    for (const [name, count] of counts) if (count > 1) this.errors.set(name, `${name} が複数の行・方程式グループで定義されています。`);
    const original = new Map(this.expressions);
    const expansionErrors = new Map<string, string>();
    for (const [name, expression] of original) {
      try { this.expressions.set(name, expandCalls(expression, original)); }
      catch (error) { expansionErrors.set(name, errorText(error)); }
    }
    const graph = new Map<string, Set<string>>();
    for (const [name, expression] of this.expressions) graph.set(name, expression.kind === 'lambda' ? new Set() : freeSymbols(expression));
    for (const system of this.systems) {
      try { system.equations = system.equations.map((equation) => expandCalls(equation, original)); }
      catch (error) { system.error = errorText(error); for (const name of system.names) this.errors.set(name, system.error); }
      const references = new Set([...system.names, ...system.equations.flatMap((equation) => [...freeSymbols(equation)])]);
      for (const name of system.names) graph.set(name, references);
    }
    for (const names of stronglyConnected(graph)) {
      if (names.length === 1 && !graph.get(names[0]!)!.has(names[0]!)) continue;
      for (const name of names) if (expansionErrors.has(name)) this.errors.set(name, expansionErrors.get(name)!);
      const explicit = this.systems.filter((system) => system.names.some((name) => names.includes(name)));
      const equations = names.filter((name) => this.expressions.has(name)).map((name): Expression => ({ kind: 'binary', operator: '-', left: { kind: 'symbol', name }, right: this.expressions.get(name)! }));
      for (const system of explicit) equations.push(...system.equations);
      const methods = new Set(explicit.map((system) => system.input.method).filter((method) => method !== 'auto'));
      if (methods.size > 1) for (const name of names) this.errors.set(name, '相互依存する方程式グループでは同じ解法を選択してください。');
      const group: Group<T> = { names, equations, method: [...methods][0] ?? 'auto', precision: 0, solving: false };
      for (const name of names) this.groups.set(name, group);
    }
    for (const row of input.rows) {
      const name = statements.get(row.id)?.name;
      if (!name || !this.groups.has(name) || !row.initial?.trim()) continue;
      try {
        const statement = parse(row.initial);
        if (statement.name) throw new Error('定数項欄にはスカラー式だけを入力してください。');
        this.initial.set(name, statement.expression);
      } catch (error) { this.errors.set(name, errorText(error)); }
    }
  }
  attach(evaluator: Evaluator<T>): void { this.evaluator = evaluator; }
  resolve(name: string, precision: number): Value<T> | undefined {
    const error = this.errors.get(name); if (error) throw new Error(error);
    const group = this.groups.get(name); if (!group) return;
    if (group.solving) throw new Error('初期値・関数呼出しを介した循環参照です。定数項には解く未知数から独立したスカラーを指定してください。');
    group.solving = true;
    try {
      for (const member of group.names) if (this.errors.has(member)) throw new Error(this.errors.get(member)!);
      if (!group.solver) {
        if(!group.normalized) {
          group.equations=group.equations.map(equation=>normalizeDifferential(equation,group.names,node=>{
            const value=this.evaluator!.evaluate(node,1);if(value.kind!=='boolean')throw new Error('条件には真偽値が必要です。');return value.value;
          }));
          const analysis=differentialOrders(group.equations,group.names);
          if(analysis.calculus)group.orders=analysis.orders;
          group.normalized=true;
        }
        if(group.orders) {
          const seed={degree:undefined as number|undefined};
          const initial=group.names.map((member,i): (T|undefined)[] => {
            const expression=this.initial.get(member);if(!expression)return [];
            const requested=Math.max(1,group.orders![i]!);
            let value=this.evaluator!.evaluate(expression,requested);
            if(value.kind==='scalar')return [value.value];
            if(value.kind!=='fps')throw new Error(`${member} の初期係数にはスカラーまたはseq(...)を指定してください。`);
            const count=value.knownTerms??requested;
            if(count>requested)value=this.evaluator!.evaluate(expression,count);
            if(value.kind!=='fps')throw new Error('初期係数には通常FPSが必要です。');
            return [...value.series.asPowerSeries().coefficients].slice(0,count);
          });
          const compile=implicitCompiler({field:this.field,names:group.names,definitions:this.expressions,evaluate:(node,n)=>this.evaluator!.evaluate(node,n),differential:{seed,orders:group.orders,initial}});
          group.solver=new DifferentialSystem(this.field,group.names,group.equations.map(compile),initial,group.orders,seed,group.equations.map(eq=>differentialOrders([eq],group.names).orders));
        } else {
          const compile = implicitCompiler({ field: this.field, names: group.names, definitions: this.expressions, evaluate: (node, n) => this.evaluator!.evaluate(node, n) });
          const initial = group.names.map((member) => {
            const expression = this.initial.get(member); if (!expression) return undefined;
            const value = this.evaluator!.evaluate(expression, 1);
            if (value.kind !== 'scalar') throw new Error(`${member} の定数項には有理数または素数modのスカラーが必要です。`);
            return value.value;
          });
          group.solver = new ImplicitSystem(this.field, group.names, group.equations.map(compile), initial, group.method);
        }
      }
      const values = group.solver.solve(precision);
      group.precision = Math.max(group.precision, precision);
      return { kind: 'fps', series: new LaurentSeries(this.field, values[group.names.indexOf(name)]!.coefficients) };
    } catch (error) { throw new Error(`循環参照・連立系 [${group.names.join(', ')}]: ${errorText(error)}`); }
    finally { group.solving = false; }
  }
  metadata(name: string): RowResult['solver'] {
    const group = this.groups.get(name);
    return group?.solver ? { names: group.names, method: group.solver.method, precision: group.precision } : undefined;
  }
  results(precision: number, format: (name: string, value: Value<T>) => RowResult): EquationSystemResult[] {
    return this.systems.map((system) => {
      try {
        if (system.error) throw new Error(system.error);
        const solutions = system.names.map((name) => format(name, this.resolve(name, precision)!));
        return { id: system.input.id, solutions };
      } catch (error) { return { id: system.input.id, solutions: [], error: errorText(error) }; }
    });
  }
}
