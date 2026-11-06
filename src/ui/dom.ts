/** コンポーネント内の要素だけを検索し、テンプレートの不整合を早く検出する。 */
export function query<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`画面の要素が見つかりません: ${selector}`);
  return element;
}
