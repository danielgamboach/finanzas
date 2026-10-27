import { useEffect, useRef, useState } from 'react';
import { Spinner } from '../ds';
import { Icon } from '.';

const PULL = 72; // px of pull (after resistance) that reloads
// places where a downward drag already means something else
const SKIP = '[role="dialog"], .sheet-backdrop, .tx-sheet.open, .ds-chart__plot, input, textarea, select, [data-no-ptr]';

/** Every scrollable box from the touched element up is at its top. */
function atTop(el: Element | null) {
  for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight && n.scrollTop > 0) return false;
  }
  return (document.scrollingElement?.scrollTop ?? 0) <= 0;
}

/**
 * Pull down while already at the top of a screen to reload the app (fresh data and, when there is one,
 * the newest version). A round badge follows the finger and turns into a spinner once it's far enough.
 * Phone only; sheets, drawers and the chart keep their own drags.
 */
export function PullToRefresh() {
  const [y, setY] = useState(0);
  const [loading, setLoading] = useState(false);
  const yRef = useRef(0);

  useEffect(() => {
    let sx = 0, sy = 0, armed = false, decided = false, pulling = false;
    const set = (v: number) => {
      yRef.current = v;
      setY(v);
    };
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return (armed = false);
      const t = e.target as Element;
      armed = !t.closest(SKIP) && atTop(t);
      decided = false;
      pulling = false;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    };
    const move = (e: TouchEvent) => {
      if (!armed) return;
      const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
      if (!decided) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        decided = true;
        // only a mostly vertical pull downwards; sideways swipes keep moving between panels
        pulling = dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.5;
        if (!pulling) return (armed = false);
      }
      if (!pulling) return;
      if (e.cancelable) e.preventDefault();
      set(Math.max(0, Math.min(PULL * 1.6, dy * 0.5)));
    };
    const end = () => {
      if (!pulling) return;
      pulling = false;
      armed = false;
      if (yRef.current >= PULL) {
        setLoading(true);
        set(PULL);
        navigator.vibrate?.(10);
        // a beat so the spinner is seen before the page goes
        setTimeout(() => location.reload(), 250);
      } else set(0);
    };
    addEventListener('touchstart', start, { passive: true });
    addEventListener('touchmove', move, { passive: false });
    addEventListener('touchend', end);
    addEventListener('touchcancel', end);
    return () => {
      removeEventListener('touchstart', start);
      removeEventListener('touchmove', move);
      removeEventListener('touchend', end);
      removeEventListener('touchcancel', end);
    };
  }, []);

  if (!y && !loading) return null;
  const ready = y >= PULL;
  return (
    <div className={`ptr${y === 0 ? ' is-idle' : ''}`} style={{ transform: `translate(-50%, ${y - 44}px)` }} role="status" aria-label={loading ? 'Recargando' : ready ? 'Soltá para recargar' : 'Jalá para recargar'}>
      {loading ? <Spinner size={18} label="Recargando" /> : <span style={{ transform: `rotate(${(y / PULL) * 270}deg)`, opacity: Math.min(1, y / PULL + 0.2) }} className={ready ? 'ptr-icon is-ready' : 'ptr-icon'}><Icon name="refresh" size={18} /></span>}
    </div>
  );
}
