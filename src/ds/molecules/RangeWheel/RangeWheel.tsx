import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import './RangeWheel.css';

export interface RangeWheelOption<T extends string> { value: T; label: React.ReactNode; ariaLabel?: string }

/**
 * A horizontal wheel of options (Día, Semana, Mes, Semestre, Año): swipe it sideways and the one that stops in
 * the middle is chosen; tapping one brings it to the middle. The chosen one is bright, its neighbors fade
 * with the distance. Arrow keys move one step.
 */
export function RangeWheel<T extends string>({ options, value, onChange, label, className }: {
  options: RangeWheelOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
  className?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const current = useRef(value);
  current.current = value;
  const settling = useRef(0);
  const centered = useRef(-1);

  /** Index of the item closest to the middle, and each item's fade by distance. */
  const paint = useCallback(() => {
    const el = track.current;
    if (!el) return -1;
    const mid = el.scrollLeft + el.clientWidth / 2;
    let best = 0, dist = Infinity;
    items.current.forEach((b, i) => {
      if (!b) return;
      const c = b.offsetLeft + b.offsetWidth / 2;
      const d = Math.abs(c - mid);
      if (d < dist) { dist = d; best = i; }
      // one step away keeps most of its strength, two steps fade out
      const steps = d / Math.max(1, b.offsetWidth + 16);
      b.style.opacity = String(Math.max(0.25, 1 - Math.max(0, steps - 0.5) * 0.45));
    });
    items.current.forEach((b, i) => b?.classList.toggle('is-center', i === best));
    if (best !== centered.current) {
      if (centered.current !== -1) navigator.vibrate?.(1);
      centered.current = best;
    }
    return best;
  }, []);

  const center = useCallback((i: number, smooth: boolean) => {
    const el = track.current, b = items.current[i];
    if (!el || !b) return;
    el.scrollTo({ left: b.offsetLeft + b.offsetWidth / 2 - el.clientWidth / 2, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // start with the chosen one in the middle, and follow changes made from outside
  useLayoutEffect(() => {
    const i = options.findIndex((o) => o.value === value);
    if (i >= 0 && i !== centered.current) center(i, centered.current !== -1);
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // while swiping, repaint; when it stops, the one in the middle is the choice
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let raf = 0;
    const settle = () => {
      const i = paint();
      const o = options[i];
      if (o && o.value !== current.current) onChange(o.value);
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); });
      window.clearTimeout(settling.current);
      settling.current = window.setTimeout(settle, 120);
    };
    el.addEventListener('scroll', on, { passive: true });
    const resize = () => {
      const i = options.findIndex((o) => o.value === current.current);
      center(i, false);
      paint();
    };
    addEventListener('resize', resize);
    return () => {
      el.removeEventListener('scroll', on);
      removeEventListener('resize', resize);
      window.clearTimeout(settling.current);
      cancelAnimationFrame(raf);
    };
  }, [options, onChange, paint, center]);

  const pickAt = (i: number) => {
    const o = options[Math.max(0, Math.min(options.length - 1, i))];
    if (!o) return;
    center(options.indexOf(o), true);
    if (o.value !== current.current) onChange(o.value);
  };

  return (
    <div
      ref={track}
      className={['ds-wheel', className].filter(Boolean).join(' ')}
      role="radiogroup"
      aria-label={label}
      data-no-swipe
      onKeyDown={(e) => {
        const i = options.findIndex((o) => o.value === value);
        if (e.key === 'ArrowRight') { e.preventDefault(); pickAt(i + 1); items.current[i + 1]?.focus(); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); pickAt(i - 1); items.current[i - 1]?.focus(); }
      }}
    >
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(b) => { items.current[i] = b; }}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          aria-label={o.ariaLabel}
          tabIndex={o.value === value ? 0 : -1}
          className="ds-wheel__item"
          onClick={() => pickAt(i)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
