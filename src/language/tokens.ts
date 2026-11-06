import { SourceError } from './source.ts';
export interface Token { text: string; position: number; end: number; kind: 'space' | 'integer' | 'identifier' | 'operator' | 'invalid' }
/** パーサと編集支援が共有する字句解析。編集途中の入力はtolerantで全て保持する。 */
export function tokenize(source: string, tolerant = false, offset = 0): Token[] {
  const tokens: Token[] = []; let position = 0;
  while (position < source.length) {
    const match = /^(\s+|=>|==|!=|<=|>=|&&|\|\||\d+|[A-Za-z_][A-Za-z_0-9]*|[+\-*/%^(),=\[\]!:?<>])/.exec(source.slice(position));
    if (!match && !tolerant) throw new SourceError(`${position + offset + 1} 文字目: 使用できない文字です。`, position + offset, position + offset + 1);
    const text = match?.[0] ?? source[position]!;
    const kind = !match ? 'invalid' : /^\s/.test(text) ? 'space' : /^\d/.test(text) ? 'integer' : /^[A-Za-z_]/.test(text) ? 'identifier' : 'operator';
    tokens.push({ text, position: position + offset, end: position + offset + text.length, kind }); position += text.length;
  }
  return tokens;
}
