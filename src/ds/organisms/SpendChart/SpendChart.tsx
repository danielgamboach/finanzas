import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { RangeWheel, type RangeWheelOption } from '../../molecules/RangeWheel/RangeWheel';
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
const LOW = 7; // px, the smallest bar with any spend (so a little stands apart from nothing)
const MAX = 56;
const KNEE = 0.82; // share of the height for the ordinary days

/**
 * Bar height for a spend. Daily spend is lopsided: most days are small and a few (rent, the big shop) are huge,
 * so a plain scale flattens the ordinary days into the floor. The scale bends at the busy end of the ordinary
 * days (the 85th percentile of the days with spend): below it heights are linear, so a 20.000 day is clearly
 * four times a 5.000 day; above it they grow on a log curve into the top of the chart, still ordered by size.
 */
export function spendScale(values: number[]) {
  const pos = values.filter((v) => v > 0).sort((a, b) => a - b);
  const max = pos[pos.length - 1] ?? 1;
  const p85 = pos.length >= 5 ? pos[Math.floor((pos.length - 1) * 0.85)] : max;
  // only bend when there really are outliers; otherwise the whole height is linear
  const knee = p85 * 1.25 < max ? p85 * 1.15 : max;
  return (v: number | null | undefined) => {
    if (!v || v <= 0) return MIN;
    const t = v <= knee ? (v / knee) * (knee < max ? KNEE : 1) : KNEE + (1 - KNEE) * (Math.log(v / knee) / Math.log(max / knee));
    return Math.round(LOW + (MAX - LOW) * Math.min(1, t));
  };
}

/**
 * Spend as thin vertical bars (half hours, quarter days, days or weeks) with the ranges underneath on a sideways
 * wheel (the chosen one sits in the middle). Heights follow `spendScale`, so ordinary days are told apart.
 * Touch, drag or hover a bar: it lights up, the same bar of the previous period shows behind it as a
 * wider ghost, and the tooltip compares both. Both ends of the range are labeled under the bars.
 */
export function SpendChart<T extends string>({ bars, format, unit, ranges, range, onRange, label, ends }: {
  bars: SpendChartBar[];
  /** Number only, no currency: "100.000". */
  format: (n: number) => string;
  unit?: string;
  ranges: RangeWheelOption<T>[];
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
  const scale = useMemo(() => spendScale(bars.flatMap((b) => [b.value ?? 0, b.prev ?? 0])), [bars]);
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
      <RangeWheel value={range} onChange={onRange} options={ranges} label="Rango del gráfico" />
    </div>
  );
}
