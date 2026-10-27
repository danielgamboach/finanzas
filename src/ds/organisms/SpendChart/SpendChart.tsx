import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Segmented, type SegmentedOption } from '../../molecules/Segmented/Segmented';
import './SpendChart.css';

export interface SpendChartBar {
  /** Spend in this bar; null when it's still in the future (drawn faint, not counted). */
  value: number | null;
  /** The same bar in the period it's compared with; null when that period has none. */
  prev: number | null;
  /** "Martes 27 oct", "Semana del 3 al 9 ago" */
  title: string;
  /** Quieter second line: "14:00 a 14:30", "Mañana · 6:00 a 12:00" */
  sub?: string;
  /** "Oct" / "Sep", "Hoy" / "Ayer", "3 ago" / "2 feb" */
  curLabel: string;
  prevLabel: string;
}

const MIN = 4; // px, an empty bar
const MAX = 24;

/**
 * Spend as thin vertical bars (half hours, quarter days, days or weeks) with the quick ranges underneath.
 * Touch, drag or hover a bar: it lights up, the same bar of the previous period shows behind it as a
 * wider ghost, and the tooltip compares both. Both ends of the range are labeled under the bars.
 */
export function SpendChart<T extends string>({ bars, format, unit, ranges, range, onRange, label, ends }: {
  bars: SpendChartBar[];
  /** Number only, no currency: "100.000". */
  format: (n: number) => string;
  unit?: string;
  ranges: SegmentedOption<T>[];
  range: T;
  onRange: (v: T) => void;
  label?: string;
  /** Labels under the first and last bar: "1 oct" … "31 oct". */
  ends?: [string, string];
}) {
  const root = useRef<HTMLDivElement>(null);
  const plot = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [shift, setShift] = useState(0);
  const pressed = useRef(false);

  const shown = bars.length ? bars : Array.from({ length: 31 }, () => null);
  // both periods share the scale, so the ghost of the previous one is honest
  const max = Math.max(1, ...bars.map((b) => Math.max(b.value ?? 0, b.prev ?? 0)));
  // square root, so one big day (the rent) doesn't flatten all the others
  const scale = (v: number | null | undefined) => (v && v > 0 ? MIN + Math.round((MAX - MIN) * Math.sqrt(v / max)) : MIN);
  const height = (b: SpendChartBar | null) => scale(b?.value);

  // a new range starts clean
  useEffect(() => setSel(null), [range, bars.length]);

  // tapping anywhere else closes the tooltip
  useEffect(() => {
    if (sel === null) return;
    const off = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setSel(null);
    };
    addEventListener('pointerdown', off);
    return () => removeEventListener('pointerdown', off);
  }, [sel]);

  const pick = (clientX: number) => {
    const el = plot.current;
    if (!el || !bars.length) return;
    const slots = el.querySelectorAll<HTMLElement>('.ds-chart__slot');
    let best = 0, dist = Infinity;
    slots.forEach((s, i) => {
      const r = s.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - clientX);
      if (d < dist) { dist = d; best = i; }
    });
    setSel((s) => {
      // a light tick on each new bar while scrubbing (Android; iOS ignores it)
      if (s !== null && s !== best) navigator.vibrate?.(1);
      return best;
    });
  };

  // where the selected bar sits, and keep the tooltip inside the screen
  const [x, setX] = useState(0);
  useLayoutEffect(() => {
    if (sel === null || !plot.current) return;
    const slot = plot.current.querySelectorAll<HTMLElement>('.ds-chart__slot')[sel];
    if (!slot) return;
    const cx = slot.offsetLeft + slot.offsetWidth / 2;
    setX(cx);
    const w = tip.current?.offsetWidth ?? 0;
    const W = plot.current.offsetWidth;
    const pad = 8;
    setShift(Math.max(-pad, Math.min(W + pad - w, cx - w / 2)) - (cx - w / 2));
  }, [sel, bars]);

  const b = sel !== null ? bars[sel] : null;
  const top = b ? Math.max(height(b), b.prev !== null ? scale(b.prev) : 0) : 0;
  const total = bars.reduce((a, x) => a + (x.value ?? 0), 0);

  return (
    <div ref={root} className="ds-chart">
      <div
        ref={plot}
        className={`ds-chart__plot${b ? ' is-picking' : ''}`}
        tabIndex={0}
        role="group"
        aria-label={`${label ?? 'Gasto'}: ${format(total)}${unit ? ` ${unit}` : ''}. Usá las flechas para ver cada barra.`}
        onPointerDown={(e) => {
          pressed.current = true;
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          pick(e.clientX);
        }}
        onPointerMove={(e) => (pressed.current || e.pointerType === 'mouse') && pick(e.clientX)}
        onPointerUp={() => (pressed.current = false)}
        onPointerCancel={() => (pressed.current = false)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && !pressed.current && setSel(null)}
        onKeyDown={(e) => {
          if (!bars.length) return;
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            const d = e.key === 'ArrowRight' ? 1 : -1;
            setSel((s) => Math.max(0, Math.min(bars.length - 1, (s ?? (d > 0 ? -1 : bars.length)) + d)));
          } else if (e.key === 'Escape') setSel(null);
        }}
      >
        {shown.map((bar, i) => (
          <span key={i} className={['ds-chart__slot', bar && bar.value === null && 'is-future', sel === i && 'is-on'].filter(Boolean).join(' ')}>
            {sel === i && bar && bar.prev !== null && <span className="ds-chart__ghost" style={{ height: scale(bar.prev) }} aria-hidden="true" />}
            <span className="ds-chart__bar" style={{ height: height(bar) }} />
          </span>
        ))}
        {b && (
          <>
            <span className="ds-chart__line" style={{ left: x, bottom: 4 + top + 4 }} aria-hidden="true" />
            <div ref={tip} className="ds-chart__tip" style={{ left: x, transform: `translateX(calc(-50% + ${shift}px))` }} role="status" aria-live="polite">
              <span className="ds-chart__tip-head">
                <span className="ds-chart__tip-title">{b.title}</span>
                {b.sub && <span className="ds-chart__tip-label">{b.sub}</span>}
              </span>
              {b.value !== null && (
                <span className="ds-chart__tip-row">
                  <span className="ds-chart__dot is-cur" aria-hidden="true" />
                  <span className="ds-chart__tip-label">{b.curLabel}</span>
                  <span>{format(b.value)}</span>
                  {unit && <span className="ds-chart__tip-label">{unit}</span>}
                </span>
              )}
              {b.prev !== null && (
                <span className="ds-chart__tip-row">
                  <span className="ds-chart__dot is-prev" aria-hidden="true" />
                  <span className="ds-chart__tip-label">{b.prevLabel}</span>
                  <span>{format(b.prev)}</span>
                  {unit && <span className="ds-chart__tip-label">{unit}</span>}
                </span>
              )}
            </div>
          </>
        )}
      </div>
      {ends && bars.length > 0 && (
        <div className="ds-chart__ends" aria-hidden="true">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      )}
      <Segmented size="ghost" value={range} onChange={onRange} options={ranges} label="Rango del gráfico" />
    </div>
  );
}
