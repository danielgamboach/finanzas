import { useRef } from 'react';

/**
 * Hold a row for `ms` (default half a second) to fire `onLong`, with a short vibration where the phone
 * supports it. Moving the finger (a scroll) cancels it, and the click that follows a long press is
 * swallowed so the row doesn't also open. Works with a mouse too.
 */
export function useLongPress<T>(onLong: (item: T) => void, ms = 500) {
  const st = useRef<{ timer: number; x: number; y: number; fired: boolean } | null>(null);
  const clear = () => {
    if (st.current) clearTimeout(st.current.timer);
  };
  return (item: T) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      clear();
      const s = { x: e.clientX, y: e.clientY, fired: false, timer: 0 };
      s.timer = window.setTimeout(() => {
        s.fired = true;
        navigator.vibrate?.(12);
        onLong(item);
      }, ms);
      st.current = s;
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = st.current;
      if (s && !s.fired && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onClickCapture: (e: React.MouseEvent) => {
      if (st.current?.fired) {
        e.preventDefault();
        e.stopPropagation();
        st.current = null;
      }
    },
    // no "copy / share" callout on a held row
    onContextMenu: (e: React.MouseEvent) => {
      if (st.current) e.preventDefault();
    },
  });
}
