import { captureEditorState } from '../interactions/editor-state.ts';
import { MAX_COMMENT_LENGTH } from '../../config/limits.ts';
import type { EditorState, ExpressionActions } from './expression-row-types.ts';

/** コメントは数式解析へ渡さず、ネイティブtextareaとIMEを保って履歴へ接続する。 */
export class RowComment {
  readonly element=document.createElement('details');
  readonly input=document.createElement('textarea');
  private composing=false;
  private before:EditorState|undefined;
  private readonly id:string;
  constructor(id:string,actions:Pick<ExpressionActions,'comment'|'select'|'breakHistoryGroup'>,restoring:()=>boolean) {
    this.id=id;
    this.element.className='row-comment';
    const summary=document.createElement('summary');summary.textContent='コメント';
    this.input.className='comment-input';this.input.rows=2;this.input.maxLength=MAX_COMMENT_LENGTH;
    this.input.placeholder='式の意味やメモを入力';
    const commit=()=>{actions.comment(id,this.input.value,this.before);this.before=undefined;};
    const finish=()=>{if(this.composing){this.composing=false;commit();actions.breakHistoryGroup();}};
    let separate=false;
    this.input.addEventListener('beforeinput',event=>{
      if(this.composing||['historyUndo','historyRedo'].includes(event.inputType))return;
      separate=['insertFromPaste','insertFromDrop','insertReplacementText','deleteByCut'].includes(event.inputType);
      if(separate)actions.breakHistoryGroup();
      this.before=this.state();
    });
    this.input.addEventListener('input',()=>{if(!this.composing){commit();if(separate){actions.breakHistoryGroup();separate=false;}}});
    this.input.addEventListener('compositionstart',()=>{this.composing=true;this.before=this.state();actions.breakHistoryGroup();});
    this.input.addEventListener('compositionend',finish);
    this.input.addEventListener('blur',()=>{finish();this.before=undefined;actions.breakHistoryGroup();});
    this.input.addEventListener('focus',()=>{if(!restoring())actions.select(id);});
    this.input.addEventListener('pointerdown',actions.breakHistoryGroup);
    this.input.addEventListener('keydown',event=>{
      if(event.isComposing||event.keyCode===229)return;
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key)||(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a')actions.breakHistoryGroup();
    });
    this.element.append(summary,this.input);
  }
  state():EditorState { return captureEditorState(this.id, this.input, 'comment'); }
  update(value:string,index:number):void {
    if(!this.composing&&this.input.value!==value){this.input.value=value;if(value)this.element.open=true;}
    this.input.setAttribute('aria-label',`式 ${index+1} のコメント`);
  }
}
