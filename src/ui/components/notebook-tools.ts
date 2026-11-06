import type { NotebookTemplate } from '../../app/templates.ts';
import { notebookTemplates } from '../../app/templates.ts';
import { query } from '../dom.ts';
import { DocumentActionsView } from './document-actions-view.ts';
import type { DocumentActions } from './document-actions-view.ts';
import { TemplateLibraryView } from './template-library-view.ts';
import type { TemplateActions } from './template-library-view.ts';
import { VariableRenameView } from './variable-rename-view.ts';
import type { RenameActions } from './variable-rename-view.ts';

export interface NotebookToolActions extends DocumentActions, RenameActions, TemplateActions {}

/** ツールの配置と共通通知欄を所有する。各フォームの状態は子Viewへ分ける。 */
export class NotebookTools {
  private readonly status: HTMLElement;
  private readonly rename: VariableRenameView;

  constructor(host: HTMLElement, actions: NotebookToolActions, library: readonly NotebookTemplate[] = notebookTemplates) {
    host.innerHTML = `
      <details class="notebook-document-tools"><summary>保存・共有・名前変更</summary>
        <div id="document-actions"></div><div id="variable-rename"></div>
      </details>
      <div id="template-library-host"></div>
      <p id="document-status" role="status" aria-live="polite"></p>`;
    this.status = query(host, '#document-status');
    const show = (message: string, error = false) => this.show(message, error);
    new DocumentActionsView(query(host, '#document-actions'), actions, show);
    this.rename = new VariableRenameView(query(host, '#variable-rename'), actions, show);
    new TemplateLibraryView(query(host, '#template-library-host'), actions, show, library);
  }

  show(message: string, error = false): void {
    this.status.textContent = message;
    this.status.classList.toggle('error', error);
  }
  renderNames(names: string[]): void { this.rename.renderNames(names); }
}
