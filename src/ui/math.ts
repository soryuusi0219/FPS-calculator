import { render } from 'katex';

export function renderMath(tex: string, target: HTMLElement): void {
  if (tex.length > 16000) { target.textContent = tex; return; }
  render(tex, target, { throwOnError: false, trust: false, maxExpand: 1000, maxSize: 20, output: 'htmlAndMathml' });
}
