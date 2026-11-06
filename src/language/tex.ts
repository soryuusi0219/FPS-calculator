import type { Expression, Statement } from './parser.ts';

const group = (tex: string) => `\\left(${tex}\\right)`;
const identifier = (name: string) => name.length === 1 ? name === '_' ? '\\_' : name : `\\mathrm{${name.replaceAll('_', '\\_')}}`;
const precedences: Record<string, number> = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, C: 7, P: 7, H: 7, '^': 9 };
function enclose(node: Expression, minimum: number): string {
  const precedence = node.kind === 'binary' ? precedences[node.operator]! : node.kind === 'unary' ? 8 : node.kind === 'lambda' || node.kind === 'conditional' ? 0 : 100;
  const tex = expressionTex(node);
  return precedence < minimum ? group(tex) : tex;
}

/** ASTからのみTeXを生成する。ユーザー入力をTeXコマンドとして解釈しない。 */
export function expressionTex(node: Expression): string {
  const tex = expressionTex;
  switch (node.kind) {
    case 'integer': return String(node.value);
    case 'symbol': return identifier(node.name);
    case 'unary': return `${node.operator === '-' ? '-' : '\\neg '}${enclose(node.operand, 8)}`;
    case 'factorial': return `${enclose(node.operand, 11)}!`;
    case 'index': return `\\left[x^{${tex(node.index)}}\\right]${group(tex(node.target))}`;
    case 'lambda': return `${group(node.parameters.map(identifier).join(','))}\\mapsto ${tex(node.body)}`;
    case 'conditional': return `\\begin{cases}${tex(node.yes)} & ${tex(node.condition)}\\\\${tex(node.no)} & \\text{otherwise}\\end{cases}`;
    case 'binary': {
      switch (node.operator) {
        case '/': return `\\frac{${tex(node.left)}}{${tex(node.right)}}`;
        case '^': return `${enclose(node.left, 10)}^{${tex(node.right)}}`;
        case 'C': return `\\binom{${tex(node.left)}}{${tex(node.right)}}`;
        case 'P': case 'H': return `{}_{${tex(node.left)}}\\mathrm{${node.operator}}_{${tex(node.right)}}`;
        default: {
          const operators: Record<string, string> = { '*': '\\cdot', '%': '\\bmod', '<=': '\\le', '>=': '\\ge', '==': '=', '!=': '\\ne', '&&': '\\land', '||': '\\lor' };
          const precedence = precedences[node.operator]!;
          return `${enclose(node.left, precedence)} ${operators[node.operator] ?? node.operator} ${enclose(node.right, precedence + 1)}`;
        }
      }
    }
    case 'call': {
      const name = node.callee.kind === 'symbol' ? node.callee.name : '';
      if (name === 'sqrt' && node.args.length === 1) return `\\sqrt{${tex(node.args[0]!)}}`;
      if (name === 'coeff' && node.args.length === 2) return `\\left[x^{${tex(node.args[1]!)}}\\right]${group(tex(node.args[0]!))}`;
      if (['C', 'nCk', 'binom'].includes(name) && node.args.length === 2) return `\\binom{${tex(node.args[0]!)}}{${tex(node.args[1]!)}}`;
      if (name === 'factorial' && node.args.length === 1) return `${enclose(node.args[0]!, 11)}!`;
      if (name === 'fps' && node.args[0]?.kind === 'lambda' && node.args[0].parameters.length === 1) {
        const lambda = node.args[0]; const n = identifier(lambda.parameters[0]!);
        return `\\sum_{${n}=0}^{\\infty}${enclose(lambda.body, 6)}x^{${n}}`;
      }
      return `${name ? `\\operatorname{${name.replaceAll('_', '\\_')}}` : group(tex(node.callee))}\\left(${node.args.map(tex).join(',\\,')}\\right)`;
    }
  }
}

export function statementTex(statement: Statement): string {
  return `${statement.name ? `${identifier(statement.name)} = ` : ''}${expressionTex(statement.expression)}`;
}

export function scalarTex(value: string): string {
  const negative = value.startsWith('-');
  const [numerator, denominator] = (negative ? value.slice(1) : value).split('/');
  return `${negative ? '-' : ''}${denominator ? `\\frac{${numerator}}{${denominator}}` : numerator}`;
}

export function seriesTex(coefficients: string[], basis: 'ogf' | 'egf', startDegree = 0): string {
  if (basis === 'egf' && startDegree < 0) throw new Error('負の次数の階乗はE.G.F.表示に使用できません。');
  const terms: string[] = [];
  coefficients.forEach((value, offset) => {
    const n = startDegree + offset;
    if (value === '0') return;
    const negative = value.startsWith('-');
    const magnitude = negative ? value.slice(1) : value;
    const power = n === 0 ? '' : n === 1 ? 'x' : `x^{${n}}`;
    let term = `${magnitude === '1' && n !== 0 ? '' : scalarTex(magnitude)}${power}`;
    if (basis === 'egf' && n >= 2) term = `\\frac{${term}}{${n}!}`;
    terms.push(`${negative ? '-' : terms.length ? '+' : ''}${term}`);
  });
  return `${terms.join('') || '0'}+O\\left(x^{${startDegree + coefficients.length}}\\right)`;
}
