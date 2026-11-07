import type { EditorState } from '../components/expression-row-types.ts';

/** 履歴用の選択範囲とスクロール位置。DOMや行IDを変更しない。 */
export function captureEditorState(id: string, input: HTMLInputElement | HTMLTextAreaElement, field: NonNullable<EditorState['field']>, viewport: HTMLElement = input): EditorState {
  return {
    id, field, start: input.selectionStart ?? 0, end: input.selectionEnd ?? 0,
    direction: input.selectionDirection ?? 'none', scrollLeft: viewport.scrollLeft,
    ...(field === 'comment' ? { scrollTop: input.scrollTop } : {}),
  };
}
