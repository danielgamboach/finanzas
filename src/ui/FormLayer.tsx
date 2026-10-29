import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { TxForm } from '../screens/TxForm';
import { navigateBack } from '../store';
import { swipeBlocked } from '../lib/swipe';

export type FormSpec = { key: string; id?: string };
export type FormLayerHandle = {
  /** Shell drags the new-movement form in from the right edge (swipe left on Inicio). */
  peekStart: () => void;
  peekMove: (p: number) => void;
  /** true: the form stays (the caller then moves the address to #/agregar); false: it goes back out. */
  peekEnd: (commit: boolean) => void;
};

const MS = 320;

/** The address that opens the form: #/agregar (new) or #/mov/<id>/editar. */
export function formSpecOf(path: string): FormSpec | null {
  if (path === '/agregar' || path.startsWith('/agregar/')) return { key: 'new' };
  const m = path.match(/^\/mov\/([^/]+)\/editar/);
  return m ? { key: m[1], id: m[1] } : null;
}

/**
 * The movement form as a page that slides in from the right over the current screen and leaves the same way.
 * Swiping right on it (or the back arrow) closes it. `onProgress` lets the screen underneath move along.
 */
export const FormLayer = forwardRef<FormLayerHandle, { spec: FormSpec | null; onProgress?: (p: number, animate: boolean) => void }>(function FormLayer({ spec, onProgress }, ref) {
  const [shown, setShown] = useState<(FormSpec & { peek?: boolean }) | null>(spec);
  const el = useRef<HTMLDivElement>(null);
  const p = useRef(0);
  const timer = useRef(0);
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;

  const set = (v: number, animate: boolean) => {
    p.current = v;
    const n = el.current;
    if (n) {
      n.classList.toggle('dragging', !animate);
      n.style.setProperty('--form-p', String(v));
    }
    progressRef.current?.(v, animate);
  };
  const open = () => requestAnimationFrame(() => requestAnimationFrame(() => set(1, true)));
  const close = () => {
    set(0, true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShown(null), MS);
  };

  // follow the address: in from the right when it appears, out to the right when it goes
  const shownRef = useRef(shown);
  shownRef.current = shown;
  useEffect(() => {
    window.clearTimeout(timer.current);
    const cur = shownRef.current;
    if (spec) {
      if (!cur || cur.key !== spec.key) set(0, false);
      setShown({ ...spec });
      if (p.current < 1 || !cur || cur.key !== spec.key) open();
    } else if (cur && !cur.peek) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec?.key]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  useImperativeHandle(ref, () => ({
    peekStart: () => {
      window.clearTimeout(timer.current);
      setShown((cur) => cur ?? { key: 'new', peek: true });
      set(0, false);
    },
    peekMove: (v) => set(Math.max(0, Math.min(1, v)), false),
    peekEnd: (commit) => {
      if (commit) {
        set(1, true);
        // focus while still inside the finger's gesture, so the phone opens the keyboard
        el.current?.querySelector<HTMLInputElement>('.amount-input input')?.focus({ preventScroll: true });
      } else close();
    },
  }));

  // swipe right on the form to put it away
  useEffect(() => {
    const n = el.current;
    if (!n || !shown) return;
    let sx = 0, sy = 0, st = 0, dx = 0, tracking = false, dragging = false;
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1 || swipeBlocked(e.target as Element, n)) return (tracking = false);
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      st = Date.now();
      dx = 0;
      tracking = true;
      dragging = false;
    };
    const move = (e: TouchEvent) => {
      if (!tracking) return;
      const x = e.touches[0].clientX - sx, y = e.touches[0].clientY - sy;
      if (!dragging) {
        if (Math.abs(x) < 10 && Math.abs(y) < 10) return;
        if (x <= 0 || Math.abs(x) < Math.abs(y) * 1.2) return void (tracking = false);
        dragging = true;
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
      e.preventDefault();
      dx = Math.max(0, x);
      set(1 - dx / n.clientWidth, false);
    };
    const end = () => {
      if (!tracking) return;
      tracking = false;
      if (!dragging) return;
      const speed = dx / Math.max(1, Date.now() - st);
      if (dx > n.clientWidth * 0.35 || (dx > 40 && speed > 0.5)) {
        set(0, true);
        navigateBack();
      } else set(1, true);
    };
    n.addEventListener('touchstart', start, { passive: true });
    n.addEventListener('touchmove', move, { passive: false });
    n.addEventListener('touchend', end);
    n.addEventListener('touchcancel', end);
    return () => {
      n.removeEventListener('touchstart', start);
      n.removeEventListener('touchmove', move);
      n.removeEventListener('touchend', end);
      n.removeEventListener('touchcancel', end);
    };
  }, [shown?.key]);

  // Esc closes it on a keyboard
  useEffect(() => {
    if (!spec) return;
    const on = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.sheet-backdrop') && navigateBack();
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [spec]);

  if (!shown) return null;
  return (
    <div ref={el} className="form-layer dragging" data-no-ptr>
      <TxForm key={shown.key} id={shown.id} autoFocusAmount={!shown.id && !shown.peek} />
    </div>
  );
});
