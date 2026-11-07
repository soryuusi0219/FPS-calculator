import { completions } from '../../language/editor-analysis.ts';
import type { Completion } from '../../language/editor-analysis.ts';

type EditorInput = HTMLInputElement | HTMLTextAreaElement;
interface Options {
  boundary(): void;
  composing(): boolean;
  onApply(): void;
  ignoreScrollFrom(target: Node): boolean;
}
let serial = 0;

/** 補完候補の選択・配置・確定を所有する。確定はネイティブ入力イベントで通知する。 */
export class CompletionMenu {
  private readonly input: EditorInput;
  private readonly options: Options;
  private readonly popup = document.createElement('div');
  private names: readonly string[] = [];
  private suggestions: { start: number; end: number; items: Completion[] } = { start: 0, end: 0, items: [] };
  private selected = 0;
  private open = false;
  private readonly updateOnViewportChange = (event: Event) => {
    if (event.target instanceof Node && (event.target === this.input || this.options.ignoreScrollFrom(event.target) || this.popup.contains(event.target))) return;
    this.position();
  };

  constructor(input: EditorInput, options: Options) {
    this.input = input;
    this.options = options;
    this.popup.className = 'code-completions';
    this.popup.id = `code-completions-${serial++}`;
    this.popup.hidden = true;
    this.popup.setAttribute('role', 'listbox');
    this.popup.setAttribute('aria-label', '入力補完');
    document.body.append(this.popup);
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', this.popup.id);
    input.setAttribute('aria-haspopup', 'listbox');
    input.addEventListener('keydown', (raw) => {
      const event = raw as KeyboardEvent;
      if (event.isComposing || this.options.composing() || event.keyCode === 229) return;
      if ((event.ctrlKey || event.metaKey) && event.code === 'Space') { event.preventDefault(); event.stopImmediatePropagation(); this.show(true); return; }
      if (!this.open) return;
      if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (event.key === 'Escape') this.hide();
        else if (event.key === 'Enter' || event.key === 'Tab') this.accept(this.selected);
        else { this.selected = (this.selected + (event.key === 'ArrowDown' ? 1 : -1) + this.suggestions.items.length) % this.suggestions.items.length; this.paintSuggestions(); }
      } else if (event.ctrlKey || event.metaKey || ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) this.hide();
    }, { capture: true });
    window.addEventListener('scroll', this.updateOnViewportChange, { capture: true, passive: true });
    window.addEventListener('resize', this.updateOnViewportChange);
  }
  setNames(names: readonly string[]): void { this.names = names; }
  hide(): void { this.open = false; this.popup.hidden = true; this.input.removeAttribute('aria-activedescendant'); this.input.setAttribute('aria-expanded', 'false'); }
  show(force = false): void {
    if (this.options.composing() || document.activeElement !== this.input || this.input.selectionStart !== this.input.selectionEnd) { this.hide(); return; }
    this.suggestions = completions(this.input.value, this.input.selectionStart ?? 0, this.names, force);
    this.selected = 0; this.open = this.suggestions.items.length > 0;
    if (this.open) this.paintSuggestions(); else this.hide();
  }
  private paintSuggestions(): void {
    this.popup.replaceChildren(); this.popup.hidden = false; this.input.setAttribute('aria-expanded', 'true');
    this.suggestions.items.forEach((item, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.tabIndex = -1;
      button.id = `${this.popup.id}-${index}`; button.setAttribute('role', 'option'); button.setAttribute('aria-selected', String(index === this.selected));
      button.textContent = `${item.name}${item.kind === 'function' ? `(${Array(item.arity).fill('…').join(', ')})` : ''}`;
      button.onpointerdown = (event) => event.preventDefault(); button.onclick = () => this.accept(index); this.popup.append(button);
    });
    this.input.setAttribute('aria-activedescendant', `${this.popup.id}-${this.selected}`); this.position();
    this.popup.children[this.selected]?.scrollIntoView({ block: 'nearest' });
  }
  position(): void {
    if (!this.open) return;
    const rect = this.input.getBoundingClientRect();
    const panel = this.input.closest('.notebook')?.getBoundingClientRect();
    if (rect.bottom < Math.max(0, panel?.top ?? 0) || rect.top > Math.min(innerHeight, panel?.bottom ?? innerHeight)) { this.hide(); return; }
    const left = Math.max(8, Math.min(innerWidth - 268, rect.left));
    this.popup.style.left = `${left}px`; this.popup.style.top = `${Math.max(8, Math.min(innerHeight - this.popup.offsetHeight - 8, rect.bottom + 4))}px`;
  }
  private accept(index: number): void {
    const item = this.suggestions.items[index]; if (!item) return;
    const {start,end} = this.suggestions;
    const parentheses = item.kind === 'function' && this.input.value[end] !== '(';
    const text = item.name + (parentheses ? '()' : '');
    if (this.input.value.length - (end-start) + text.length > this.input.maxLength) { this.hide(); return; }
    this.options.boundary();
    const before = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertReplacementText', data: text });
    if (!this.input.dispatchEvent(before)) return;
    this.input.setRangeText(text,start,end,'end');
    const caret = start + text.length - (parentheses ? 1 : 0); this.input.setSelectionRange(caret,caret);
    this.input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertReplacementText',data:text}));
    this.options.boundary(); this.hide(); this.options.onApply();
  }
  destroy(): void {
    this.popup.remove();
    window.removeEventListener('scroll', this.updateOnViewportChange, true);
    window.removeEventListener('resize', this.updateOnViewportChange);
  }
}
