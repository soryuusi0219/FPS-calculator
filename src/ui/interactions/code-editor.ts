import { CompletionMenu } from './completion-menu.ts';
import { bracketMatches, syntaxDiagnostic } from '../../language/editor-analysis.ts';
import type { EditorMode } from '../../language/editor-analysis.ts';
import { builtinDefinition } from '../../language/builtins.ts';
import type { Diagnostic } from '../../language/source.ts';
import { tokenize } from '../../language/tokens.ts';

let serial = 0;
interface Options { mode: EditorMode; wide?: boolean; boundary(): void }
/** ネイティブ入力を維持し、色分け・位置表示・補完だけを重ねる。入力の確定は既存のinputイベントへ送る。 */
export class CodeEditor {
  private readonly input: HTMLInputElement | HTMLTextAreaElement;
  private readonly options: Options;
  private readonly host: HTMLElement;
  private readonly overlay = document.createElement('pre');
  private readonly message = document.createElement('button');
  private readonly completion: CompletionMenu;
  private readonly observer: ResizeObserver;
  private remote: Diagnostic | undefined;
  private composing = false;

  constructor(input: HTMLInputElement | HTMLTextAreaElement, options: Options) {
    this.input = input; this.options = options;
    if (options.wide) this.host = input.parentElement!;
    else { this.host = document.createElement('div'); input.before(this.host); this.host.append(input); }
    this.host.classList.add('code-editor'); input.classList.add('code-input');
    this.overlay.className = 'code-overlay'; this.overlay.setAttribute('aria-hidden', 'true'); this.host.prepend(this.overlay);
    this.message.className = 'code-diagnostic'; this.message.type = 'button'; this.message.hidden = true;
    this.message.id = `code-message-${serial++}`; input.setAttribute('aria-errormessage', this.message.id);
    this.host.after(this.message);
    this.completion = new CompletionMenu(input, {
      boundary: options.boundary,
      composing: () => this.composing,
      onApply: () => this.refresh(),
      ignoreScrollFrom: target => this.overlay.contains(target),
    });
    this.message.onclick = () => {
      const diagnostic = syntaxDiagnostic(input.value, options.mode) ?? this.remote;
      if (!diagnostic) return; input.focus(); input.setSelectionRange(diagnostic.start, diagnostic.end); this.refresh();
      input.dispatchEvent(new Event('keyup'));
    };
    input.addEventListener('input', () => { this.remote = undefined; this.refresh(); if (!this.composing) this.completion.show(); });
    input.addEventListener('click', () => { this.refresh(); this.completion.hide(); });
    input.addEventListener('keyup', () => this.refresh());
    input.addEventListener('select', () => this.refresh());
    input.addEventListener('focus', () => this.refresh());
    input.addEventListener('scroll', () => { this.overlay.scrollLeft = input.scrollLeft; this.overlay.scrollTop = input.scrollTop; this.completion.position(); });
    input.addEventListener('blur', () => this.completion.hide());
    input.addEventListener('compositionstart', () => { this.composing = true; this.host.classList.add('code-composing'); this.completion.hide(); this.message.hidden = true; });
    input.addEventListener('compositionend', () => { this.composing = false; this.host.classList.remove('code-composing'); queueMicrotask(() => this.refresh()); });
    this.observer = new ResizeObserver(() => this.refresh()); this.observer.observe(input);
    this.refresh();
  }
  setNames(names: readonly string[]): void { this.completion.setNames(names); }
  setDiagnostic(diagnostic?: Diagnostic): void { this.remote = diagnostic; this.refresh(); }
  refresh(): void {
    const input = this.input; const style = getComputedStyle(input);
    this.overlay.style.font = style.font; this.overlay.style.lineHeight = style.lineHeight;
    this.overlay.style.padding = style.padding;
    this.overlay.style.left = `${input.offsetLeft + input.clientLeft}px`; this.overlay.style.top = `${input.offsetTop + input.clientTop}px`;
    this.overlay.style.width = `${input.clientWidth}px`; this.overlay.style.height = `${input.clientHeight}px`;
    const diagnostic = this.composing ? undefined : syntaxDiagnostic(input.value, this.options.mode) ?? this.remote;
    const brackets = bracketMatches(input.value, input.selectionStart ?? 0);
    const fragment = document.createDocumentFragment();
    for (const token of tokenize(input.value, true)) {
      const span = document.createElement('span'); span.textContent = token.text;
      span.className = `code-${token.kind === 'identifier' && builtinDefinition(token.text) ? 'function' : token.kind}`;
      if (brackets.matching.includes(token.position)) span.classList.add('code-match');
      if (brackets.invalid.includes(token.position)) span.classList.add('code-unmatched');
      if (diagnostic && token.position < diagnostic.end && token.end > diagnostic.start) span.classList.add('code-error');
      fragment.append(span);
    }
    if (diagnostic && diagnostic.start >= input.value.length) { const end = document.createElement('span'); end.className = 'code-error'; end.textContent = ' '; fragment.append(end); }
    this.overlay.replaceChildren(fragment);
    this.overlay.scrollLeft = input.scrollLeft; this.overlay.scrollTop = input.scrollTop;
    this.message.hidden = !diagnostic;
    input.setAttribute('aria-invalid', String(Boolean(diagnostic)));
    if (diagnostic) {
      const before = input.value.slice(0, diagnostic.start).split('\n');
      this.message.textContent = `${before.length > 1 ? `${before.length}行 ` : ''}${before.at(-1)!.length + 1}列: ${diagnostic.message}`;
    }
    this.completion.position();
  }
  destroy(): void {
    this.observer.disconnect();
    this.completion.destroy();
  }
}
