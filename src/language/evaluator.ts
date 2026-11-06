import type { Field, Rational } from '../core/field.ts';
import { exactRoot, rational, rationalField } from '../core/field.ts';
import { combinatorial, factorial } from '../core/combinatorics.ts';
import { Series } from '../core/series.ts';
import { LaurentSeries } from '../core/laurent.ts';
import { catalanSeries, lambertW } from '../core/special-series.ts';
import { MAX_COEFFICIENT_INDEX, MAX_EVALUATION_DEPTH, MAX_EVALUATION_STEPS, MAX_INTEGER_EXPONENT, MAX_INTERNAL_PRECISION, MAX_POLE_ORDER, MAX_SCALAR_BITS, MIN_COEFFICIENT_INDEX } from '../config/limits.ts';
import type { Expression } from './parser.ts';
import { SourceError } from './source.ts';
import { expressionRange } from './expression-range.ts';
import type { Lambda, Scalar, Scope, Value } from './values.ts';
export type { Value } from './values.ts';
import { sequenceBuiltin, sequenceFunctionNames } from './sequence-functions.ts';
import { builtinDefinition, validateBuiltinArity } from './builtins.ts';

/** 型付きの値と要求精度。添字・指数にはmodで還元する前の厳密値を使う。 */
export class Evaluator<T> {
  readonly field: Field<T>;
  private readonly lookup: (name: string) => Expression;
  private readonly memo = new Map<string, Value<T>>();
  private readonly visiting: string[] = [];
  private steps = 0;
  private depth = 0;
  private readonly resolveImplicit: ((name: string, precision: number) => Value<T> | undefined) | undefined;

  constructor(field: Field<T>, lookup: (name: string) => Expression, resolveImplicit?: (name: string, precision: number) => Value<T> | undefined) { this.field = field; this.lookup = lookup; this.resolveImplicit = resolveImplicit; }

  private scalar(exact: Rational, value?: T): Scalar<T> {
    if (exact.numerator.toString(2).length + exact.denominator.toString(2).length > MAX_SCALAR_BITS) throw new Error(`スカラー値のサイズが上限${MAX_SCALAR_BITS} bitを超えました。`);
    return { kind: 'scalar', exact, value: value ?? this.field.div(this.field.fromInteger(exact.numerator), this.field.fromInteger(exact.denominator)) };
  }
  private integer(value: bigint): Scalar<T> { return this.scalar(rational(value), this.field.fromInteger(value)); }
  private fromCoefficient(value: T): Scalar<T> { return this.scalar(this.field.asRational(value), value); }
  private requireScalar(value: Value<T>): Scalar<T> {
    if (value.kind !== 'scalar') throw new Error('この演算にはスカラーが必要です。FPSの係数は f[k] で取り出してください。');
    return value;
  }
  private exactInteger(value: Value<T>): bigint {
    const exact = this.requireScalar(value).exact;
    if (exact.denominator !== 1n) throw new Error('この引数には整数のスカラーが必要です。');
    return exact.numerator;
  }
  private condition(value: Value<T>): boolean {
    if (value.kind !== 'boolean') throw new Error('条件には比較式などの真偽値が必要です。');
    return value.value;
  }
  private series(value: Value<T>, precision: number, promote = true): LaurentSeries<T> {
    if (value.kind === 'scalar' && promote) return LaurentSeries.constant(this.field, value.value, precision);
    if (value.kind !== 'fps') throw new Error('この演算にはFPSが必要です。fps(...) で明示的に生成できます。');
    return value.series.truncate(precision);
  }

  symbol(name: string, precision: number): Value<T> {
    if (name === 'x' || name === 'X') return { kind: 'fps', series: new LaurentSeries(this.field, Array.from({ length: precision }, (_, i) => i === 1 ? this.field.one : this.field.zero)) };
    if (name === 'true' || name === 'false') return { kind: 'boolean', value: name === 'true' };
    const implicit = this.resolveImplicit?.(name, precision);
    if (implicit) return implicit;
    if (this.visiting.includes(name)) throw new Error(`循環参照: ${[...this.visiting, name].join(' → ')}。この呼出しを含む循環は対応する正則系として解析できません。`);
    const key = `${name}:${precision}`;
    const cached = this.memo.get(key);
    if (cached) return cached;
    if (name === 'Catalan') {
      const value: Value<T> = { kind: 'fps', series: new LaurentSeries(this.field, catalanSeries(this.field, precision).coefficients) };
      this.memo.set(key, value);
      return value;
    }
    const expression = this.lookup(name);
    this.visiting.push(name);
    try {
      const value = this.evaluate(expression, precision);
      this.memo.set(key, value);
      return value;
    } finally { this.visiting.pop(); }
  }

  evaluate(node: Expression, precision: number, scope: Scope<T> = new Map()): Value<T> {
    if (!Number.isInteger(precision) || precision < 1 || precision > MAX_INTERNAL_PRECISION) throw new Error(`必要な内部精度が上限${MAX_INTERNAL_PRECISION}を超えました。`);
    if (++this.steps > MAX_EVALUATION_STEPS) throw new Error('式の評価回数が上限を超えました。');
    if (++this.depth > MAX_EVALUATION_DEPTH) { this.depth--; throw new Error('式やラムダ呼出しの入れ子が深すぎます。'); }
    try { return this.evaluateNode(node, precision, scope); }
    catch (error) {
      const span = expressionRange(node);
      // 別の定義やラムダ内の位置を参照元の入力へ持ち出さない。
      if (!span || error instanceof SourceError && node.kind !== 'symbol' && node.kind !== 'call') throw error;
      throw new SourceError(error instanceof Error ? error.message : String(error), span.start, span.end);
    }
    finally { this.depth--; }
  }

  private evaluateNode(node: Expression, precision: number, scope: Scope<T>): Value<T> {
    const ev = (expression: Expression, requested = precision) => this.evaluate(expression, requested, scope);
    switch (node.kind) {
      case 'integer': return this.integer(node.value);
      case 'symbol': return scope.get(node.name) ?? this.symbol(node.name, precision);
      case 'lambda': return { ...node, scope: new Map(scope) };
      case 'factorial': return this.integer(factorial(this.exactInteger(ev(node.operand))));
      case 'index': return this.index(node.target, this.exactInteger(ev(node.index)), scope);
      case 'conditional': return ev(this.condition(ev(node.condition)) ? node.yes : node.no);
      case 'unary': {
        const value = ev(node.operand);
        if (node.operator === '!') return { kind: 'boolean', value: !this.condition(value) };
        if (value.kind === 'fps') return { kind: 'fps', series: value.series.neg() };
        const scalar = this.requireScalar(value);
        return this.scalar(rationalField.sub(rationalField.zero, scalar.exact), this.field.sub(this.field.zero, scalar.value));
      }
      case 'binary': {
        const operator = node.operator;
        if (operator === '^') return this.power(node.left, node.right, precision, scope);
        const left = ev(node.left);
        if (operator === '&&') return { kind: 'boolean', value: this.condition(left) && this.condition(ev(node.right)) };
        if (operator === '||') return { kind: 'boolean', value: this.condition(left) || this.condition(ev(node.right)) };
        const right = ev(node.right);
        if (['<', '<=', '>', '>=', '==', '!='].includes(operator)) {
          const a = this.requireScalar(left).exact; const b = this.requireScalar(right).exact;
          const difference = a.numerator * b.denominator - b.numerator * a.denominator;
          return { kind: 'boolean', value: operator === '<' ? difference < 0n : operator === '<=' ? difference <= 0n : operator === '>' ? difference > 0n : operator === '>=' ? difference >= 0n : operator === '==' ? difference === 0n : difference !== 0n };
        }
        const combination = builtinDefinition(operator)?.combinatorial;
        if (combination) return this.integer(combinatorial(combination, this.exactInteger(left), this.exactInteger(right)));
        if (operator === '%') {
          const divisor = this.exactInteger(right);
          if (divisor === 0n) throw new Error('0 による剰余は定義されません。');
          return this.integer(this.exactInteger(left) % divisor);
        }
        if (left.kind === 'fps' || right.kind === 'fps') {
          if (operator === '/') return { kind: 'fps', series: this.divide(node.left, node.right, precision, scope) };
          if (operator === '*') return { kind: 'fps', series: this.multiply(node.left, node.right, precision, scope) };
          const a = this.series(left, precision); const b = this.series(right, precision);
          return { kind: 'fps', series: operator === '+' ? a.add(b) : a.sub(b) };
        }
        const a = this.requireScalar(left); const b = this.requireScalar(right);
        const method = operator === '+' ? 'add' : operator === '-' ? 'sub' : operator === '*' ? 'mul' : 'div';
        return this.scalar(rationalField[method](a.exact, b.exact), this.field[method](a.value, b.value));
      }
      case 'call': {
        if (node.callee.kind === 'symbol' && builtinDefinition(node.callee.name)) return this.callBuiltin(node.callee.name, node.args, precision, scope);
        const callee = ev(node.callee);
        if (callee.kind !== 'lambda') throw new Error('呼び出せるのは関数またはラムダ式です。');
        return this.invoke(callee, node.args.map((arg) => ev(arg)), precision);
      }
    }
  }

  private invoke(lambda: Lambda<T>, args: Value<T>[], precision: number, extra: Scope<T> = new Map()): Value<T> {
    if (lambda.parameters.length !== args.length) throw new Error(`ラムダには ${lambda.parameters.length} 個の引数が必要です。`);
    const scope = new Map([...extra, ...lambda.scope]);
    lambda.parameters.forEach((name, i) => scope.set(name, args[i]!));
    return this.evaluate(lambda.body, precision, scope);
  }

  private index(target: Expression, index: bigint, scope: Scope<T>): Scalar<T> {
    const local = target.kind === 'symbol' ? scope.get(target.name) : undefined;
    if (local?.kind === 'history' || local?.kind === 'scalar' && local.coefficient) {
      if (index < BigInt(-MAX_INTERNAL_PRECISION) || index >= BigInt(MAX_INTERNAL_PRECISION)) throw new Error('係数参照の内部上限を超えました。');
      return local.coefficient!(Number(index));
    }
    if (index < BigInt(MIN_COEFFICIENT_INDEX) || index > BigInt(MAX_COEFFICIENT_INDEX)) throw new Error(`係数の添字は ${MIN_COEFFICIENT_INDEX}〜${MAX_COEFFICIENT_INDEX} の整数に制限しています。`);
    const value = this.evaluate(target, Number(index < 0n ? 1n : index + 1n), scope);
    if (value.kind === 'scalar' && value.coefficient) return value.coefficient(Number(index));
    if (value.kind !== 'fps') throw new Error('係数抽出にはFPSが必要です。スカラーには添字を付けられません。');
    return this.fromCoefficient(this.series(value, Number(index < 0n ? 1n : index + 1n), false).at(Number(index)));
  }

  private readSeries(node: Expression, precision: number, scope: Scope<T>): LaurentSeries<T> {
    precision = Math.max(1, precision);
    return this.series(this.evaluate(node, precision, scope), precision);
  }

  private nonzeroSeries(node: Expression, precision: number, scope: Scope<T>): LaurentSeries<T> {
    let value = this.evaluate(node, precision, scope);
    let series = this.series(value, precision);
    while (!Number.isFinite(series.valuation)) {
      if (value.kind === 'scalar') throw new Error('0による除算はできません。');
      if (precision === MAX_INTERNAL_PRECISION) throw new Error(`分母・逆元の非零項を内部精度${MAX_INTERNAL_PRECISION}以内で確認できません。零級数か、位数が上限を超えています。`);
      precision = Math.min(MAX_INTERNAL_PRECISION, 2 * precision);
      value = this.evaluate(node, precision, scope);
      series = this.series(value, precision);
    }
    return series;
  }

  private divide(left: Expression, right: Expression, precision: number, scope: Scope<T>): LaurentSeries<T> {
    let b = this.nonzeroSeries(right, precision, scope);
    const a = this.readSeries(left, precision + b.valuation, scope);
    if (!Number.isFinite(a.valuation) || a.valuation - b.valuation >= precision) return LaurentSeries.constant(this.field, this.field.zero, precision);
    const required = precision - a.valuation + 2 * b.valuation;
    if (required > b.precision) b = this.readSeries(right, required, scope);
    return a.div(b, precision);
  }

  private multiply(left: Expression, right: Expression, precision: number, scope: Scope<T>): LaurentSeries<T> {
    let a = this.readSeries(left, precision, scope);
    let b = this.readSeries(right, precision, scope);
    const requiredLeft = precision - b.orderBound;
    const requiredRight = precision - a.orderBound;
    if (requiredLeft > a.precision) a = this.readSeries(left, requiredLeft, scope);
    if (requiredRight > b.precision) b = this.readSeries(right, requiredRight, scope);
    return a.mul(b, precision);
  }

  private raise(producer: (precision: number) => Value<T>, exponent: bigint, precision: number): Value<T> {
    if (exponent < -BigInt(MAX_INTEGER_EXPONENT) || exponent > BigInt(MAX_INTEGER_EXPONENT)) throw new Error(`整数の指数は -${MAX_INTEGER_EXPONENT}〜${MAX_INTEGER_EXPONENT} に制限しています。`);
    let value = producer(precision);
    let requested = precision;
    while (value.kind === 'fps' && exponent < 0n && !Number.isFinite(value.series.valuation)) {
      if (requested === MAX_INTERNAL_PRECISION) throw new Error(`逆元の非零項を内部精度${MAX_INTERNAL_PRECISION}以内で確認できません。零級数か、位数が上限を超えています。`);
      requested = Math.min(MAX_INTERNAL_PRECISION, 2 * requested);
      value = producer(requested);
    }
    if (value.kind === 'fps' && Number.isFinite(value.series.valuation) && exponent !== 0n) {
      if (value.series.valuation * Number(exponent) < -MAX_POLE_ORDER) throw new Error(`Laurent級数の負の次数は -${MAX_POLE_ORDER} までです。`);
      const required = precision - (Number(exponent) - 1) * value.series.valuation;
      if (required > value.series.precision) value = producer(required);
    }
    return this.integerPower(value, exponent, precision);
  }

  private integerPower(value: Value<T>, exponent: bigint, precision: number): Value<T> {
    if (exponent < -BigInt(MAX_INTEGER_EXPONENT) || exponent > BigInt(MAX_INTEGER_EXPONENT)) throw new Error(`整数の指数は -${MAX_INTEGER_EXPONENT}〜${MAX_INTEGER_EXPONENT} に制限しています。`);
    if (value.kind === 'fps') return { kind: 'fps', series: value.series.pow(Number(exponent), precision) };
    const a = this.requireScalar(value);
    const magnitude = Number(exponent < 0n ? -exponent : exponent);
    if ((a.exact.numerator.toString(2).length + a.exact.denominator.toString(2).length) * magnitude > MAX_SCALAR_BITS) throw new Error('べき乗の結果がスカラーのサイズ上限を超えます。');
    const exact = Series.constant(rationalField, a.exact, 1).pow(Number(exponent)).at(0);
    return this.scalar(exact, Series.constant(this.field, a.value, 1).pow(Number(exponent)).at(0));
  }

  private power(base: Expression, exponent: Expression, precision: number, scope: Scope<T>): Value<T> {
    const g = this.evaluate(exponent, precision, scope);
    if (g.kind === 'scalar' && g.exact.denominator === 1n) return this.raise((requested) => this.evaluate(base, requested, scope), g.exact.numerator, precision);
    if (g.kind === 'scalar' && g.exact.denominator === 2n) return this.raise((requested) => this.squareRoot(base, requested, scope), g.exact.numerator, precision);
    const f = this.evaluate(base, precision, scope);
    if (f.kind === 'scalar' && g.kind === 'scalar') {
      const n = exactRoot(f.exact.numerator, Number(g.exact.denominator));
      const d = exactRoot(f.exact.denominator, Number(g.exact.denominator));
      if (n === null || d === null) throw new Error('有理数乗の結果が有理数体に存在しません。');
      return this.integerPower(this.scalar(rational(n, d)), g.exact.numerator, precision);
    }
    let outer = this.series(f, precision);
    if (!this.field.equal(outer.at(0), this.field.one)) throw new Error('有理数乗・FPS乗には底の定数項が1であることが必要です。');
    const exponentSeries = this.series(g, precision);
    if (precision - exponentSeries.orderBound > outer.precision) outer = this.readSeries(base, precision - exponentSeries.orderBound, scope);
    return { kind: 'fps', series: exponentSeries.mul(outer.log(), precision).exp() };
  }

  private squareRoot(node: Expression, precision: number, scope: Scope<T>): Value<T> {
    let value = this.evaluate(node, precision, scope);
    if (value.kind === 'scalar') {
      const root = this.field.sqrt(value.value);
      return this.fromCoefficient(root);
    }
    let series = this.series(value, precision, false);
    series.asPowerSeries();
    const valuation = series.coefficients.findIndex((a) => !this.field.equal(a, this.field.zero));
    if (valuation === -1 || valuation > 0 && valuation % 2 === 0) {
      const required = valuation === -1 ? 2 * precision : precision + valuation / 2;
      value = this.evaluate(node, required, scope);
      series = this.series(value, required, false);
    }
    return { kind: 'fps', series: series.sqrt(precision) };
  }

  private callBuiltin(name: string, args: Expression[], precision: number, scope: Scope<T>): Value<T> {
    const definition = builtinDefinition(name)!;
    validateBuiltinArity(name, args.length);
    if (sequenceFunctionNames.has(name)) return sequenceBuiltin({
      field: this.field, evaluate: (node,n) => this.evaluate(node,n,scope),
      integer: value => this.exactInteger(value), scalar: value => this.fromCoefficient(value), index: n => this.integer(BigInt(n)),
      invoke: (lambda,values,n) => this.invoke(lambda,values,n), lookup: name => this.lookup(name),
    },name,args,precision);
    const arg = args[0]!;
    const ev = (node: Expression, requested = precision) => this.evaluate(node, requested, scope);
    if (name === 'if') return ev(this.condition(ev(arg)) ? args[1]! : args[2]!);
    if (name === 'coeff') return this.index(arg, this.exactInteger(ev(args[1]!)), scope);
    if (name === 'sqrt') return this.squareRoot(arg, precision, scope);
    if (name === 'inv') return this.raise((requested) => ev(arg, requested), -1n, precision);
    if (name === 'factorial') return this.integer(factorial(this.exactInteger(ev(arg))));
    if (definition.combinatorial) return this.integer(combinatorial(definition.combinatorial, this.exactInteger(ev(arg)), this.exactInteger(ev(args[1]!))));
    if (name === 'fps') {
      const value = ev(arg);
      if (value.kind !== 'lambda') {
        const series = this.series(value, precision);
        series.asPowerSeries();
        return { kind: 'fps', series };
      }
      if (value.parameters.length !== 1) throw new Error('fps のラムダは次数を受け取る1引数にしてください。');
      return { kind: 'fps', series: new LaurentSeries(this.field, Array.from({ length: precision }, (_, n) => this.requireScalar(this.invoke(value, [this.integer(BigInt(n))], precision)).value)) };
    }
    if (name === 'map') return this.map(arg, args[1]!, precision, scope);
    if (name === 'diff') return { kind: 'fps', series: this.series(ev(arg, precision + 1), precision + 1).derivative() };
    if (name === 'integral') {
      const requested = Math.max(1, precision - 1);
      return { kind: 'fps', series: this.series(ev(arg, requested), requested).integral().truncate(precision) };
    }
    if (name === 'revert') {
      const requested = Math.max(2, precision);
      return { kind: 'fps', series: this.series(ev(arg, requested), requested, false).revert().truncate(precision) };
    }
    const value = ev(arg);
    if (name === 'Catalan' || name === 'LambertW') {
      if (value.kind === 'scalar') {
        if (!this.field.equal(value.value, this.field.zero)) throw new Error(`${name} のスカラー引数は0の場合のみ対応しています。`);
        return this.integer(name === 'Catalan' ? 1n : 0n);
      }
      const input = this.series(value, precision, false).asPowerSeries();
      const series = name === 'Catalan' ? catalanSeries(this.field, precision).compose(input) : lambertW(input);
      return { kind: 'fps', series: new LaurentSeries(this.field, series.coefficients) };
    }
    if (name === 'compose') return { kind: 'fps', series: this.series(value, precision, false).compose(this.series(ev(args[1]!), precision, false)) };
    if (value.kind === 'scalar') {
      if (name === 'exp' && this.field.equal(value.value, this.field.zero)) return this.integer(1n);
      if (name === 'log' && this.field.equal(value.value, this.field.one)) return this.integer(0n);
      throw new Error(`${name} のスカラー引数は${name === 'exp' ? '0' : '1'}の場合のみ対応しています。`);
    }
    const series = this.series(value, precision, false);
    return { kind: 'fps', series: name === 'exp' ? series.exp() : series.log() };
  }

  private map(source: Expression, transform: Expression, precision: number, scope: Scope<T>): Value<T> {
    const sourceSeries = this.series(this.evaluate(source, precision, scope), precision, false);
    let lambda: Lambda<T> | undefined;
    if (transform.kind === 'lambda' || transform.kind === 'symbol' && !['a', 'n', 'i'].includes(transform.name)) {
      const candidate = this.evaluate(transform, precision, scope);
      if (candidate.kind === 'lambda') lambda = candidate;
    }
    if (lambda && lambda.parameters.length !== 1 && lambda.parameters.length !== 2) throw new Error('map のラムダは n または (a,n) の1〜2引数にしてください。');
    const coefficients = Array.from({ length: precision - sourceSeries.startDegree }, (_, offset) => {
      const n = offset + sourceSeries.startDegree;
      const a = this.fromCoefficient(sourceSeries.at(n));
      a.coefficient = (k) => this.index(source, BigInt(k), scope);
      const index = this.integer(BigInt(n));
      const extra = new Map<string, Value<T>>([['a', a], ['n', index], ['i', index]]);
      const value = lambda
        ? this.invoke(lambda, lambda.parameters.length === 1 ? [index] : [a, index], precision, extra)
        : this.evaluate(transform, precision, new Map([...scope, ...extra]));
      return this.requireScalar(value).value;
    });
    return { kind: 'fps', series: new LaurentSeries(this.field, coefficients, sourceSeries.startDegree) };
  }
}
