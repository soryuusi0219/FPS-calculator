export type ShowToolStatus = (message: string, error?: boolean) => void;

export function showToolError(show: ShowToolStatus, error: unknown): void {
  show(error instanceof Error ? error.message : String(error), true);
}

/** 操作を部分的に描画へ混ぜず、成功/失敗を共通の通知欄へ返す。 */
export function attemptToolAction(show: ShowToolStatus, action: () => void): void {
  try { action(); } catch (error) { showToolError(show, error); }
}
