/** Pointer Eventsでマウスとタッチを共通化。ドラッグ中は挿入線だけを動かす。 */
export function setupRowReordering(list: HTMLElement, onMove: (id: string, index: number) => void): void {
  const rows = () => [...list.querySelectorAll<HTMLElement>('.expression-row')];
  list.addEventListener('keydown', (event) => {
    const handle = (event.target as HTMLElement).closest<HTMLElement>('.drag-handle');
    if (!handle || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const id = handle.closest<HTMLElement>('.expression-row')!.dataset.id!;
    const entries = rows();
    const current = entries.findIndex((row) => row.dataset.id === id);
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 : current + (event.key === 'ArrowUp' ? -1 : 1);
    onMove(id, Math.max(0, Math.min(entries.length - 1, target)));
    handle.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });

  list.addEventListener('pointerdown', (event) => {
    const handle = (event.target as HTMLElement).closest<HTMLElement>('.drag-handle');
    if (!handle || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    const row = handle.closest<HTMLElement>('.expression-row')!;
    const id = row.dataset.id!;
    const pointerId = event.pointerId;
    let active = false;
    let targetIndex: number | null = null;
    let x = event.clientX;
    let y = event.clientY;
    let animation = 0;
    handle.setPointerCapture(pointerId);
    const clearIndicator = () => {
      list.querySelectorAll('.drop-before').forEach((entry) => entry.classList.remove('drop-before'));
      list.classList.remove('drop-at-end');
    };
    const indicate = () => {
      clearIndicator();
      const rectangle = list.getBoundingClientRect();
      if (x < rectangle.left - 24 || x > rectangle.right + 24 || y < Math.max(0, rectangle.top) - 40 || y > Math.min(innerHeight, rectangle.bottom) + 40) { targetIndex = null; return; }
      const remaining = rows().filter((entry) => entry !== row);
      const before = remaining.findIndex((entry) => {
        const box = entry.getBoundingClientRect();
        return y < box.top + box.height / 2;
      });
      targetIndex = before === -1 ? remaining.length : before;
      if (before === -1) list.classList.add('drop-at-end');
      else remaining[before]!.classList.add('drop-before');
    };
    const scroll = () => {
      if (!active) return;
      const rectangle = list.getBoundingClientRect();
      const top = Math.max(0, rectangle.top);
      const bottom = Math.min(innerHeight, rectangle.bottom);
      const delta = x >= rectangle.left && x <= rectangle.right ? y < top + 32 ? -10 : y > bottom - 32 ? 10 : 0 : 0;
      if (delta) {
        if (list.scrollHeight > list.clientHeight) list.scrollTop += delta;
        else window.scrollBy(0, delta);
        indicate();
      }
      animation = requestAnimationFrame(scroll);
    };
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      x = next.clientX; y = next.clientY;
      if (!active && Math.hypot(x - event.clientX, y - event.clientY) >= 5) {
        active = true;
        row.classList.add('dragging');
        document.body.classList.add('row-reordering');
        animation = requestAnimationFrame(scroll);
      }
      if (active) { next.preventDefault(); indicate(); }
    };
    const finish = (cancelled: boolean) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('blur', cancel);
      cancelAnimationFrame(animation);
      clearIndicator();
      row.classList.remove('dragging');
      document.body.classList.remove('row-reordering');
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      if (active && !cancelled && targetIndex !== null) onMove(id, targetIndex);
    };
    const up = (next: PointerEvent) => { if (next.pointerId === pointerId) finish(false); };
    const cancel = () => finish(true);
    const escape = (next: KeyboardEvent) => { if (next.key === 'Escape') { next.preventDefault(); cancel(); } };
    document.addEventListener('pointermove', move, { passive: false });
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
    document.addEventListener('keydown', escape);
    window.addEventListener('blur', cancel);
  });
}
