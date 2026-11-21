import reference from '../../../docs/reference.md?raw';
import referenceUrl from '../../../docs/reference.md?url';
import { renderReferenceMarkdown } from '../documentation/markdown.ts';

/** 同梱ドキュメントの表示だけを所有し、ノート・履歴・計算状態には触れない。 */
export class ReferenceView {
  private readonly dialog = document.createElement('dialog');
  private readonly content = document.createElement('article');
  private rendered = false;

  constructor(trigger: HTMLButtonElement) {
    this.dialog.id = 'reference-dialog'; this.dialog.className = 'reference-dialog';
    this.dialog.setAttribute('aria-labelledby', 'reference-title');
    const toolbar = document.createElement('div'); toolbar.className = 'reference-toolbar';
    const title = document.createElement('h2'); title.id = 'reference-title'; title.textContent = '機能リファレンス';
    const controls = document.createElement('div'); controls.className = 'reference-controls';
    const download = document.createElement('a'); download.textContent = 'Markdown保存'; download.href = referenceUrl;
    download.download = 'fps-reference.md'; download.className = 'secondary-button';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '閉じる';
    close.className = 'secondary-button'; close.autofocus = true; close.onclick = () => this.dialog.close();
    controls.append(download, close); toolbar.append(title, controls);
    this.content.className = 'reference-content';
    this.dialog.append(toolbar, this.content); document.body.append(this.dialog);
    trigger.setAttribute('aria-controls', this.dialog.id); trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.onclick = () => {
      if (!this.rendered) { this.content.innerHTML = renderReferenceMarkdown(reference); this.rendered = true; }
      if (!this.dialog.open) this.dialog.showModal();
      trigger.setAttribute('aria-expanded', 'true');
    };
    this.dialog.onclose = () => trigger.setAttribute('aria-expanded', 'false');
    this.content.onclick = event => {
      const link = event.target instanceof Element ? event.target.closest('a') : null;
      const href = link?.getAttribute('href');
      if (!href?.startsWith('#reference-')) return;
      event.preventDefault();
      const target = document.getElementById(href.slice(1));
      if (target && this.content.contains(target)) { target.scrollIntoView({ block: 'start' }); target.focus({ preventScroll: true }); }
    };
  }
}
