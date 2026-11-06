import { MAX_EXPRESSION_LENGTH, MAX_PARSE_DEPTH } from '../config/limits.ts';
import { functionNames } from './builtins.ts';
import { tokenize } from './tokens.ts';
import { SourceError } from './source.ts';
import type { SourceRange } from './source.ts';
export { functionNames } from './builtins.ts';

export type BinaryOperator = '+' | '-' | '*' | '/' | '%' | '^' | 'nCk' | 'nPk' | 'nHk' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||';
export type Expression =
  | { kind: 'integer'; value: bigint; span?: SourceRange }
  | { kind: 'symbol'; name: string; span?: SourceRange }
  | { kind: 'unary'; operator: '-' | '!'; operand: Expression }
  | { kind: 'binary'; operator: BinaryOperator; left: Expression; right: Expression }
  | { kind: 'call'; callee: Expression; args: Expression[] }
  | { kind: 'index'; target: Expression; index: Expression }
  | { kind: 'factorial'; operand: Expression }
  | { kind: 'lambda'; parameters: string[]; body: Expression; parameterSpans?: SourceRange[] }
  | { kind: 'conditional'; condition: Expression; yes: Expression; no: Expression };

export interface Statement { name: string | null; expression: Expression; nameSpan?: SourceRange }
const reserved = new Set<string>(['x', 'X', 'a', 'n', 'true', 'false', ...functionNames]);
export function validDefinitionName(name: string): boolean { return /^[A-Za-z_][A-Za-z_0-9]*$/.test(name) && !reserved.has(name); }

/** 方程式の = を定義や真偽値の == と区別する。 */
export function parseEquation(source: string, offset = 0): Expression {
  let depth = 0; const equals: number[] = [];
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    if (c === '=' && depth === 0 && !'!<=>'.includes(source[i - 1] ?? ' ') && !'=>'.includes(source[i + 1] ?? ' ')) equals.push(i);
  }
  if (equals.length !== 1) throw new SourceError('方程式は 左辺 = 右辺 の形で入力してください（1行に1本）。', offset, offset + source.length);
  if (source.length > MAX_EXPRESSION_LENGTH) throw new Error(`方程式1本は${MAX_EXPRESSION_LENGTH}文字までです。`);
  const left = parse(source.slice(0, equals[0]), offset); const right = parse(source.slice(equals[0]! + 1), offset + equals[0]! + 1);
  if (left.name || right.name) throw new Error('方程式の左右に定義を含められません。');
  return { kind: 'binary', operator: '-', left: left.expression, right: right.expression };
}

/** 安全なAST、乗算の省略、ラムダ・条件式。JavaScriptの実行はしない。 */
export function parse(source: string, offset = 0): Statement {
  if (source.length > MAX_EXPRESSION_LENGTH) throw new Error(`1 行は ${MAX_EXPRESSION_LENGTH} 文字までです。`);
  const tokens = tokenize(source, false, offset).filter((token) => token.kind !== 'space');
  tokens.push({ text: '', position: source.length + offset, end: source.length + offset, kind: 'operator' });
  let cursor = 0;
  let depth = 0;
  const peek = () => tokens[cursor]!.text;
  const take = () => tokens[cursor++]!.text;
  const fail = (text: string): never => { throw new SourceError(`${tokens[cursor]!.position + 1} 文字目: ${text}`, tokens[cursor]!.position, tokens[cursor]!.end); };
  const expect = (text: string) => { if (peek() !== text) fail(`${text} が必要です。`); take(); };
  const identifier = (text: string) => /^[A-Za-z_][A-Za-z_0-9]*$/.test(text);

  function expression(): Expression {
    if (++depth > MAX_PARSE_DEPTH) fail('式の入れ子が深すぎます。');
    try {
      const start = cursor;
      const parameters: string[] = []; const parameterSpans: SourceRange[] = [];
      const parameter = () => { const token = tokens[cursor]!; parameterSpans.push({ start: token.position, end: token.end }); parameters.push(take()); };
      if (identifier(peek()) && tokens[cursor + 1]?.text === '=>') { parameter(); take(); }
      else if (peek() === '(') {
        take();
        if (identifier(peek())) {
          parameter();
          while (peek() === ',' && identifier(tokens[cursor + 1]?.text ?? '')) { take(); parameter(); }
        }
        if (peek() === ')' && tokens[cursor + 1]?.text === '=>') {
          if (parameters.length === 0) fail('ラムダには1個以上の引数が必要です。');
          take(); take();
        }
        else { cursor = start; parameters.length = 0; parameterSpans.length = 0; }
      }
      if (parameters.length) {
        if (new Set(parameters).size !== parameters.length) fail('ラムダの引数名が重複しています。');
        if (parameters.some((name) => (functionNames as readonly string[]).includes(name) || name === 'true' || name === 'false')) fail('ラムダの引数に関数名・真偽値は使えません。');
        return { kind: 'lambda', parameters, parameterSpans, body: expression() };
      }
      const condition = binary(0);
      if (peek() !== '?') return condition;
      take(); const yes = expression(); expect(':');
      return { kind: 'conditional', condition, yes, no: expression() };
    } finally { depth--; }
  }

  const precedences: Record<string, number> = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, nCk: 7, nPk: 7, nHk: 7 };
  function binary(minimum: number): Expression {
    let left = unary();
    while (true) {
      // nCk(n,k)等は関数呼出し。5 nCk 2等の中置演算と区別する。
      const isOperator = Object.hasOwn(precedences, peek()) && !(precedences[peek()] === 7 && tokens[cursor + 1]?.text === '(');
      const implicit = !isOperator && (identifier(peek()) || peek() === '(');
      const precedence = isOperator ? precedences[peek()]! : implicit ? 6 : -1;
      if (precedence < minimum) break;
      const operator = isOperator ? take() as BinaryOperator : '*';
      left = { kind: 'binary', operator, left, right: binary(precedence + 1) };
    }
    return left;
  }

  function unary(): Expression {
    if (peek() === '+') { take(); return unary(); }
    if (peek() === '-' || peek() === '!') {
      const operator = take() as '-' | '!';
      return { kind: 'unary', operator, operand: unary() };
    }
    const left = postfix();
    if (peek() !== '^') return left;
    take();
    return { kind: 'binary', operator: '^', left, right: unary() };
  }

  function postfix(): Expression {
    let value = atom();
    while (true) {
      if (peek() === '!') { take(); value = { kind: 'factorial', operand: value }; }
      else if (peek() === '[') { take(); const index = expression(); expect(']'); value = { kind: 'index', target: value, index }; }
      else if (peek() === '(' && (value.kind === 'symbol' || value.kind === 'lambda' || value.kind === 'call' || value.kind === 'index')) {
        take(); const args: Expression[] = [];
        if (peek() !== ')') {
          args.push(expression());
          while (peek() === ',') { take(); args.push(expression()); }
        }
        expect(')'); value = { kind: 'call', callee: value, args };
      } else return value;
    }
  }

  function atom(): Expression {
    const token = peek();
    const span = { start: tokens[cursor]!.position, end: tokens[cursor]!.end };
    if (/^\d+$/.test(token)) { take(); return { kind: 'integer', value: BigInt(token), span }; }
    if (identifier(token)) { take(); return { kind: 'symbol', name: token, span }; }
    if (token === '(') { take(); const value = expression(); expect(')'); return value; }
    return fail('数値・変数・括弧を入力してください。');
  }

  let name: string | null = null;
  let nameSpan: SourceRange | undefined;
  if (identifier(peek()) && tokens[cursor + 1]?.text === '=') {
    nameSpan = { start: tokens[cursor]!.position, end: tokens[cursor]!.end };
    name = take();
    if (reserved.has(name)) throw new SourceError(`${name} は予約済みの名前です。`, nameSpan.start, nameSpan.end);
    take();
  }
  const value = expression();
  if (peek() !== '') fail('余分な入力があります。数値同士の乗算は * で明示してください。');
  return { name, expression: value, ...(nameSpan ? { nameSpan } : {}) };
}
