import { useEffect, useRef, useState } from 'react';

/**
 * Swipe a sheet down to close it (touch). The drag only starts when the content is scrolled to the
 * top and the finger moves down, so normal scrolling and typing keep working.
 * `scroll: 'self'` for sheets that scroll inside themselves, `'window'` for full-page sheets.
 */
export function useDragToClose<T extends HTMLElement>(onClose: () => void, scroll: 'self' | 'window' = 'self') {
  const [el, setEl] = useState<T | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!el) return;
    let startY = 0, startT = 0, dy = 0, tracking = false, dragging = false;
    const atTop = () => (scroll === 'self' ? el.scrollTop <= 0 : window.scrollY <= 0);
    const backdrop = el.parentElement?.classList.contains('sheet-backdrop') ? el.parentElement : null;

    const start = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (e.touches.length !== 1 || target.closest('input, textarea, select, [data-no-drag]') || !atTop()) return;
      startY = e.touches[0].clientY;
      startT = Date.now();
      dy = 0;
      tracking = true;
      dragging = false;
    };
    const move = (e: TouchEvent) => {
      if (!tracking) return;
      const d = e.touches[0].clientY - startY;
      if (!dragging) {
        if (Math.abs(d) < 8) return;
        if (d < 0 || !atTop()) {
          tracking = false; // scrolling up or inside the content: let it scroll
          return;
        }
        dragging = true;
        el.style.transition = 'none';
      }
      dy = Math.max(0, d);
      e.preventDefault();
      el.style.transform = `translateY(${dy}px)`;
      if (backdrop) backdrop.style.backgroundColor = `color-mix(in srgb, var(--color-black) ${Math.max(0, 50 * (1 - dy / 400))}%, transparent)`;
    };
    const end = () => {
      if (!tracking) return;
      tracking = false;
      if (!dragging) return;
      dragging = false;
      const speed = dy / Math.max(1, Date.now() - startT);
      if (dy > 120 || (dy > 40 && speed > 0.6)) {
        el.style.transition = 'transform .2s ease-out';
        el.style.transform = 'translateY(100%)';
        setTimeout(() => closeRef.current(), 180);
      } else {
        el.style.transition = 'transform .28s cubic-bezier(.2,.8,.2,1)';
        el.style.transform = '';
        if (backdrop) backdrop.style.backgroundColor = '';
      }
    };

    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [el, scroll]);

  // callback ref, so it also works when the sheet mounts after a loading state
  return setEl;
}
