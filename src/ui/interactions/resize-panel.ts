import { MAX_NOTEBOOK_WIDTH, MIN_NOTEBOOK_WIDTH } from '../../config/limits.ts';

interface ResizeOptions {
  workspace: HTMLElement;
  separator: HTMLElement;
  toggle: HTMLButtonElement;
  initialWidth: number | null;
  onChange: (width: number | null) => void;
}

export function setupNotebookResize({ workspace, separator, toggle, initialWidth, onChange }: ResizeOptions): void {
  let preferred = initialWidth;
  const bounds = () => ({ minimum: MIN_NOTEBOOK_WIDTH, maximum: Math.max(MIN_NOTEBOOK_WIDTH, Math.min(MAX_NOTEBOOK_WIDTH, innerWidth - 328)) });
  const defaultWidth = () => innerWidth <= 1050 ? 330 : innerWidth >= 1500 ? 425 : 385;
  const width = () => Math.max(bounds().minimum, Math.min(bounds().maximum, preferred ?? defaultWidth()));
  const apply = () => {
    const { minimum, maximum } = bounds();
    workspace.style.setProperty('--notebook-width', `${width()}px`);
    separator.setAttribute('aria-valuemin', String(minimum));
    separator.setAttribute('aria-valuemax', String(maximum));
    separator.setAttribute('aria-valuenow', String(width()));
    separator.setAttribute('aria-valuetext', `入力欄の幅 ${Math.round(width())} ピクセル`);
    const expanded = width() >= Math.min(760, maximum) - 1;
    toggle.textContent = expanded ? '入力欄を戻す' : '入力欄を広げる';
    toggle.setAttribute('aria-pressed', String(expanded));
  };
  const change = (value: number | null) => {
    preferred = value === null ? null : Math.max(bounds().minimum, Math.min(bounds().maximum, Math.round(value)));
    apply();
    onChange(preferred);
  };
  toggle.onclick = () => change(toggle.getAttribute('aria-pressed') === 'true' ? null : Math.min(760, bounds().maximum));
  separator.ondblclick = () => change(null);
  separator.onkeydown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    change(event.key === 'Home' ? bounds().minimum : event.key === 'End' ? bounds().maximum : width() + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 64 : 24));
  };
  separator.onpointerdown = (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    const pointerId = event.pointerId;
    const initialX = event.clientX;
    const initial = width();
    const originalPreference = preferred;
    separator.setPointerCapture(pointerId);
    document.body.classList.add('notebook-resizing');
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      preferred = Math.max(bounds().minimum, Math.min(bounds().maximum, initial + next.clientX - initialX));
      apply();
    };
    const finish = (cancelled: boolean) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('blur', cancel);
      if (separator.hasPointerCapture(pointerId)) separator.releasePointerCapture(pointerId);
      document.body.classList.remove('notebook-resizing');
      change(cancelled ? originalPreference : preferred);
    };
    const up = (next: PointerEvent) => { if (next.pointerId === pointerId) finish(false); };
    const cancel = () => finish(true);
    const escape = (next: KeyboardEvent) => { if (next.key === 'Escape') { next.preventDefault(); cancel(); } };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
    document.addEventListener('keydown', escape);
    window.addEventListener('blur', cancel);
  };
  window.addEventListener('resize', apply);
  apply();
}
