import { query } from './dom.ts';

export function createShell(root: HTMLElement) {
  root.innerHTML = `
  <header class="app-header">
    <a class="brand" href="./" aria-label="FPS calculator ホーム"><span class="brand-symbol">ƒ</span><span>FPS <strong>calculator</strong></span></a>
    <span class="header-caption">形式冪級数を、手元で確かめる。</span>
    <span class="version">LOCAL · v0.1</span>
  </header>
  <main id="workspace" class="workspace">
    <aside id="notebook" class="notebook" aria-label="計算ノート"></aside>
    <div id="notebook-resizer" class="notebook-resizer" role="separator" tabindex="0" aria-label="数式入力欄の幅" aria-orientation="vertical" aria-controls="notebook" aria-valuemin="280" aria-valuemax="1000" aria-valuenow="385" title="左右にドラッグ、または左右キーで入力幅を変更。ダブルクリックでリセット"></div>
    <section class="inspector" aria-labelledby="result-heading"></section>
  </main>`;
  return {
    workspace: query<HTMLElement>(root, '#workspace'),
    notebook: query<HTMLElement>(root, '#notebook'),
    separator: query<HTMLElement>(root, '#notebook-resizer'),
    inspector: query<HTMLElement>(root, '.inspector'),
  };
}
