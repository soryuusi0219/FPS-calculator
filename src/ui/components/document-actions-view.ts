import { MAX_NOTEBOOK_BYTES } from '../../config/limits.ts';
import { query } from '../dom.ts';
import { attemptToolAction, showToolError } from '../tool-status.ts';
import type { ShowToolStatus } from '../tool-status.ts';

export interface DocumentActions {
  exportJson(): string;
  importJson(text: string): void;
  shareUrl(): string;
}

/** ファイルとクリップボードのブラウザ操作。ノート検証・置換・履歴はcontrollerへ委譲する。 */
export class DocumentActionsView {
  private generation = 0;
  private readonly file: HTMLInputElement;
  private readonly share: HTMLInputElement;
  private readonly shareResult: HTMLElement;
  private readonly actions: DocumentActions;
  private readonly show: ShowToolStatus;

  constructor(host: HTMLElement, actions: DocumentActions, show: ShowToolStatus) {
    this.actions = actions;
    this.show = show;
    host.innerHTML = `
      <div class="document-buttons"><button id="export-json" class="secondary-button">JSON保存</button><button id="import-json" class="secondary-button">JSON読み込み</button><button id="share-notebook" class="secondary-button">共有URLを作成</button></div>
      <input id="notebook-file" type="file" accept=".json,application/json" hidden />
      <div id="share-result" hidden><label>共有URL<input id="share-url" type="text" readonly data-native-history /></label><button id="copy-share-url" class="secondary-button">URLをコピー</button></div>
      <p>JSON読み込みは現在のノートを置き換えます。元に戻すで復元できます。</p>`;
    this.file = query(host, '#notebook-file');
    this.share = query(host, '#share-url');
    this.shareResult = query(host, '#share-result');
    query<HTMLButtonElement>(host, '#export-json').onclick = () => attemptToolAction(show, () => this.download());
    query<HTMLButtonElement>(host, '#import-json').onclick = () => this.file.click();
    this.file.onchange = () => this.readFile();
    query<HTMLButtonElement>(host, '#share-notebook').onclick = () => attemptToolAction(show, () => {
      this.share.value = actions.shareUrl();
      this.shareResult.hidden = false;
      show('共有URLを作成しました。式と計算設定が含まれます。');
    });
    query<HTMLButtonElement>(host, '#copy-share-url').onclick = () => this.copyShareUrl();
  }

  private download(): void {
    const text = this.actions.exportJson();
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'fps-notebook.json';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.show('JSONを保存しました。');
  }

  private async readFile(): Promise<void> {
    const selected = this.file.files?.[0];
    const current = ++this.generation;
    this.file.value = '';
    if (!selected) return;
    try {
      if (selected.size > MAX_NOTEBOOK_BYTES) throw new Error('JSONファイルは256 KiBまでです。');
      const text = await selected.text();
      if (current !== this.generation) return;
      this.actions.importJson(text);
      this.show('JSONを読み込みました。元に戻すで読み込み前に戻れます。');
    } catch (error) {
      if (current === this.generation) showToolError(this.show, error);
    }
  }

  private async copyShareUrl(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.share.value);
      this.show('共有URLをコピーしました。');
    } catch {
      this.share.focus();
      this.share.select();
      this.show('URLを選択しました。コピーして共有してください。');
    }
  }
}
