const measurement = document.createElement('canvas').getContext('2d')!;

function textWidth(input: HTMLInputElement, text: string): number {
  const style = getComputedStyle(input);
  measurement.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  return measurement.measureText(text).width;
}

/** 入力要素自体を式の長さまで伸ばし、親に目に見える横スクロールを持たせる。 */
export function sizeExpressionInput(input: HTMLInputElement): void {
  input.style.width = `${Math.ceil(textWidth(input, input.value) + 24)}px`;
}

export function revealInputCaret(input: HTMLInputElement): void {
  if (!input.isConnected || document.activeElement !== input) return;
  const viewport = input.parentElement!;
  const position = input.selectionDirection === 'backward' ? input.selectionStart : input.selectionEnd;
  const caret = textWidth(input, input.value.slice(0, position ?? input.value.length));
  const margin = Math.min(24, viewport.clientWidth / 4);
  if (caret < viewport.scrollLeft + margin) viewport.scrollLeft = Math.max(0, caret - margin);
  else if (caret > viewport.scrollLeft + viewport.clientWidth - margin) viewport.scrollLeft = caret - viewport.clientWidth + margin;
}
