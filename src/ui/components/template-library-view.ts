import type { NotebookTemplate } from '../../app/templates.ts';
import { filterTemplates, previewTemplate, templateCategories } from '../../app/templates.ts';
import { query } from '../dom.ts';
import { attemptToolAction } from '../tool-status.ts';
import type { ShowToolStatus } from '../tool-status.ts';

export interface TemplateActions { loadTemplate(id: string): void }

/** カタログの分類・検索・選択・プレビューだけを所有する。 */
export class TemplateLibraryView {
  private readonly library: readonly NotebookTemplate[];
  private readonly category: HTMLSelectElement;
  private readonly search: HTMLInputElement;
  private readonly list: HTMLElement;
  private readonly count:HTMLElement;
  private readonly preview: HTMLTextAreaElement;
  private readonly load: HTMLButtonElement;
  private selected: string | undefined;

  constructor(host: HTMLElement, actions: TemplateActions, show: ShowToolStatus, library: readonly NotebookTemplate[]) {
    this.library = library;
    host.innerHTML = `
      <details class="template-library"><summary>サンプル集</summary>
        <p>式ごとのコメントに定義と使い方を記載しています。読み込むと現在のノートを置き換えます。「元に戻す」で復元できます。</p>
        <div class="template-filters"><label>分野<select id="template-category" data-native-history><option value="all">すべて</option></select></label><label>検索<input id="template-search" type="search" data-native-history /></label></div>
        <p id="template-count" role="status" aria-live="polite"></p>
        <div id="template-list"></div><label id="template-preview-label" hidden>プレビュー<textarea id="template-preview" readonly rows="5" data-native-history></textarea></label><button id="load-template" class="secondary-button" disabled>このサンプルを読み込む</button>
      </details>`;
    this.category = query(host, '#template-category');
    this.search = query(host, '#template-search');
    this.list = query(host, '#template-list');
    this.count=query(host,'#template-count');
    this.preview = query(host, '#template-preview');
    this.load = query(host, '#load-template');
    for (const category of templateCategories) {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.label;
      this.category.append(option);
    }
    const filter = () => { this.selected = undefined; this.list.scrollTop=0; this.render(); };
    this.category.onchange = filter;
    this.search.oninput = filter;
    this.load.onclick = () => attemptToolAction(show, () => {
      if (!this.selected) return;
      actions.loadTemplate(this.selected);
      show('サンプルを読み込みました。元に戻すで復元できます。');
    });
    this.render();
  }

  private render(): void {
    const entries = filterTemplates(this.library, this.category.value, this.search.value);
    const scroll=this.list.scrollTop;
    this.count.textContent=`${entries.length}件 / 全${this.library.length}件`;
    this.list.replaceChildren();
    if (!entries.length) this.list.textContent = this.library.length ? '条件に一致するサンプルはありません。' : 'サンプルはまだ登録されていません。';
    for (const entry of entries) {
      const button = document.createElement('button');
      button.className = 'template-entry';
      button.textContent = entry.title;
      button.setAttribute('aria-pressed', String(entry.id === this.selected));
      button.onclick = () => {
        this.selected = entry.id; this.render();
        this.list.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({preventScroll:true});
      };
      this.list.append(button);
    }
    this.list.scrollTop=scroll;
    const entry = entries.find(entry => entry.id === this.selected);
    this.load.disabled = !entry;
    this.preview.parentElement!.hidden = !entry;
    this.preview.value = entry ? previewTemplate(entry) : '';
  }
}
