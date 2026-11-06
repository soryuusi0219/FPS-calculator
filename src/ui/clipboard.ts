export function bindCopyButton(button: HTMLButtonElement, text: () => string | undefined, label: () => string): void {
  let feedback: ReturnType<typeof setTimeout> | undefined;
  button.onclick = async () => {
    const value = text();
    if (value === undefined) return;
    clearTimeout(feedback);
    try {
      await navigator.clipboard.writeText(value);
      button.textContent = 'コピーしました';
    } catch { button.textContent = 'コピーできませんでした'; }
    feedback = setTimeout(() => { button.textContent = label(); }, 1800);
  };
}
