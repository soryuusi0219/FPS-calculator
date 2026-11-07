export interface EditorState {
  id: string;
  start: number;
  end: number;
  direction: 'forward' | 'backward' | 'none';
  scrollLeft: number;
  scrollTop?: number;
  field?: 'source' | 'initial' | 'comment';
}
export interface ExpressionActions {
  select(id: string): void;
  edit(id: string, source: string, before?: EditorState): void;
  initial(id: string, value: string, before?: EditorState): void;
  comment(id: string, value: string, before?: EditorState): void;
  breakHistoryGroup(): void;
  remove(id: string): void;
  duplicate(id: string): void;
  add(): void;
}
