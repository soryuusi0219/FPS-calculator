import { query } from '../dom.ts';
import { attemptToolAction } from '../tool-status.ts';
import type { ShowToolStatus } from '../tool-status.ts';

export interface RenameActions { rename(from: string, to: string): number }

/** 入力候補と名前変更フォームを所有する。束縛の検証はapp層で行う。 */
export class VariableRenameView {
  private readonly from: HTMLSelectElement;
  private readonly to: HTMLInputElement;
  private readonly button: HTMLButtonElement;
  private names: string[] = [];

  constructor(host: HTMLElement, actions: RenameActions, show: ShowToolStatus) {
    host.innerHTML = `
      <div class="rename-fields"><label>変更元<select id="rename-from" data-native-history></select></label><label>新しい名前<input id="rename-to" type="text" maxlength="128" autocomplete="off" spellcheck="false" autocapitalize="off" data-native-history /></label></div>
      <button id="rename-variable" class="secondary-button">名前を一括変更</button>`;
    this.from = query(host, '#rename-from');
    this.to = query(host, '#rename-to');
    this.button = query(host, '#rename-variable');
    this.button.onclick = () => attemptToolAction(show, () => {
      const count = actions.rename(this.from.value, this.to.value.trim());
      show(count ? `${count}箇所の名前を変更しました。元に戻すで復元できます。` : '名前は変更されていません。');
    });
    this.renderNames([]);
  }

  renderNames(names: string[]): void {
    if (JSON.stringify(names) === JSON.stringify(this.names) && this.from.options.length) return;
    const selected = this.from.value;
    this.names = [...names];
    this.from.replaceChildren();
    for (const name of names) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      this.from.append(option);
    }
    if (names.includes(selected)) this.from.value = selected;
    if (!names.length) {
      const option = document.createElement('option');
      option.textContent = '定義された名前がありません';
      option.value = '';
      this.from.append(option);
    }
    this.button.disabled = !names.length;
  }
}
