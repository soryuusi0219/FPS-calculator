interface HistoryActions { undo(): void; redo(): void }

/** 入力内のネイティブundoとノート全体の履歴を二重に適用しない。 */
export function setupHistoryShortcuts(root: HTMLElement, actions: HistoryActions): void {
  root.addEventListener('keydown', (event) => {
    if ((event.target as HTMLElement | null)?.closest?.('[data-native-history]')) return;
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.altKey || !(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key !== 'z' && !(key === 'y' && !event.shiftKey)) return;
    event.preventDefault();
    if (key === 'y' || event.shiftKey) actions.redo(); else actions.undo();
  });
  root.addEventListener('beforeinput', (event) => {
    if ((event.target as HTMLElement | null)?.closest?.('[data-native-history]')) return;
    if (event.defaultPrevented || event.isComposing || !event.cancelable) return;
    if (event.inputType !== 'historyUndo' && event.inputType !== 'historyRedo') return;
    event.preventDefault();
    if (event.inputType === 'historyUndo') actions.undo(); else actions.redo();
  });
}
