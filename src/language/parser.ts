import { MAX_EXPRESSION_LENGTH, MAX_PARSE_DEPTH } from '../config/limits.ts';
import { functionNames } from './builtins.ts';
export { functionNames } from './builtins.ts';

export type BinaryOperator = '+' | '-' | '*' | '/' | '%' | '^' | 'C' | 'P' | 'H' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||';
export type Expression =
  | { kind: 'integer'; value: bigint }
  | { kind: 'symbol'; name: string }
  | { kind: 'unary'; operator: '-' | '!'; operand: Expression }
  | { kind: 'binary'; operator: BinaryOperator; left: Expression; right: Expression }
  | { kind: 'call'; callee: Expression; args: Expression[] }
  | { kind: 'index'; target: Expression; index: Expression }
  | { kind: 'factorial'; operand: Expression }
  | { kind: 'lambda'; parameters: string[]; body: Expression }
  | { kind: 'conditional'; condition: Expression; yes: Expression; no: Expression };

export interface Statement { name: string | null; expression: Expression }
interface Token { text: string; position: number }
const reserved = new Set<string>(['x', 'X', 'a', 'n', 'true', 'false', ...functionNames]);

/** 明示的な乗算、安全なAST、ラムダ・条件式。JavaScriptの実行はしない。 */
export function parse(source: string): Statement {
  if (source.length > MAX_EXPRESSION_LENGTH) throw new Error(`1 行は ${MAX_EXPRESSION_LENGTH} 文字までです。`);
  const tokens: Token[] = [];
  let position = 0;
  while (position < source.length) {
    const rest = source.slice(position);
    const whitespace = /^\s+/.exec(rest);
    if (whitespace) { position += whitespace[0].length; continue; }
    const compactCombination = /^[CPH](?=\d)/.test(rest) && /^(\d+|\)|\]|!)$/.test(tokens.at(-1)?.text ?? '');
    const match = compactCombination ? [rest[0]!] : /^(=>|==|!=|<=|>=|&&|\|\||\d+|[A-Za-z_][A-Za-z_0-9]*|[+\-*/%^(),=\[\]!:?<>])/.exec(rest);
    if (!match) throw new Error(`${position + 1} 文字目: 使用できない文字です。乗算は * で入力してください。`);
    tokens.push({ text: match[0]!, position });
    position += match[0]!.length;
  }
  tokens.push({ text: '', position: source.length });
  let cursor = 0;
  let depth = 0;
  const peek = () => tokens[cursor]!.text;
  const take = () => tokens[cursor++]!.text;
  const fail = (text: string): never => { throw new Error(`${tokens[cursor]!.position + 1} 文字目: ${text}`); };
  const expect = (text: string) => { if (peek() !== text) fail(`${text} が必要です。`); take(); };
  const identifier = (text: string) => /^[A-Za-z_][A-Za-z_0-9]*$/.test(text);

  function expression(): Expression {
    if (++depth > MAX_PARSE_DEPTH) fail('式の入れ子が深すぎます。');
    try {
      const start = cursor;
      const parameters: string[] = [];
      if (identifier(peek()) && tokens[cursor + 1]?.text === '=>') { parameters.push(take()); take(); }
      else if (peek() === '(') {
        take();
        if (identifier(peek())) {
          parameters.push(take());
          while (peek() === ',' && identifier(tokens[cursor + 1]?.text ?? '')) { take(); parameters.push(take()); }
        }
        if (peek() === ')' && tokens[cursor + 1]?.text === '=>') {
          if (parameters.length === 0) fail('ラムダには1個以上の引数が必要です。');
          take(); take();
        }
        else { cursor = start; parameters.length = 0; }
      }
      if (parameters.length) {
        if (new Set(parameters).size !== parameters.length) fail('ラムダの引数名が重複しています。');
        if (parameters.some((name) => (functionNames as readonly string[]).includes(name) || name === 'true' || name === 'false')) fail('ラムダの引数に関数名・真偽値は使えません。');
        return { kind: 'lambda', parameters, body: expression() };
      }
      const condition = binary(0);
      if (peek() !== '?') return condition;
      take(); const yes = expression(); expect(':');
      return { kind: 'conditional', condition, yes, no: expression() };
    } finally { depth--; }
  }

  const precedences: Record<string, number> = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, C: 7, P: 7, H: 7 };
  function binary(minimum: number): Expression {
    let left = unary();
    while (Object.hasOwn(precedences, peek()) && precedences[peek()]! >= minimum) {
      const operator = take() as BinaryOperator;
      left = { kind: 'binary', operator, left, right: binary(precedences[operator]! + 1) };
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
      else if (peek() === '(') {
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
    if (/^\d+$/.test(token)) { take(); return { kind: 'integer', value: BigInt(token) }; }
    if (identifier(token)) { take(); return { kind: 'symbol', name: token }; }
    if (token === '(') { take(); const value = expression(); expect(')'); return value; }
    return fail('数値・変数・括弧を入力してください。');
  }

  let name: string | null = null;
  if (identifier(peek()) && tokens[cursor + 1]?.text === '=') {
    name = take();
    if (reserved.has(name)) fail(`${name} は予約済みの名前です。`);
    take();
  }
  const value = expression();
  if (peek() !== '') fail('余分な入力があります。乗算は * で明示してください。');
  return { name, expression: value };
}
