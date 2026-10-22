import { useRef, useState } from 'react';

interface Props {
  /** Cumulative spend per day of this month, up to today (index 0 = day 1). */
  current: number[];
  /** Cumulative spend per day of last month (full month). */
  previous: number[] | null;
  days: number;
  budget: number;
  curLabel: string;
  prevLabel: string;
  fmt: (v: number) => string;
}

const W = 320, H = 108, TOP = 8, BOTTOM = 104;

/** Small cumulative-spend chart: this month vs. last month, with the budget as a reference line. */
export function MonthChart({ current, previous, days, budget, curLabel, prevLabel, fmt }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const prev = previous ? previous.slice(0, days) : null;
  const max = Math.max(budget, current[current.length - 1] || 0, prev ? prev[prev.length - 1] || 0 : 0, 1) * 1.08;
  const x = (i: number) => (days <= 1 ? 0 : (i / (days - 1)) * W);
  const y = (v: number) => BOTTOM - (v / max) * (BOTTOM - TOP);
  const line = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = current.length - 1;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const i = Math.round(((e.clientX - r.left) / r.width) * (days - 1));
    setHover(Math.max(0, Math.min(days - 1, i)));
  }

  const hi = hover;
  const hCur = hi !== null && hi <= last ? current[hi] : null;
  const hPrev = hi !== null && prev && hi < prev.length ? prev[hi] : null;

  return (
    <div className="mchart">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Gasto acumulado: ${curLabel} ${fmt(current[last] || 0)}${prev ? `, ${prevLabel} a esta altura ${fmt(prev[Math.min(last, prev.length - 1)] || 0)}` : ''}${budget ? `, presupuesto ${fmt(budget)}` : ''}`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <line x1="0" x2={W} y1={BOTTOM} y2={BOTTOM} className="mc-axis" />
        {budget > 0 && <line x1="0" x2={W} y1={y(budget)} y2={y(budget)} className="mc-budget" />}
        {prev && <path d={line(prev)} className="mc-prev" />}
        {current.length > 0 && (
          <>
            <path d={`${line(current)} L${x(last)},${BOTTOM} L0,${BOTTOM} Z`} className="mc-area" />
            <path d={line(current)} className="mc-cur" />
            <circle cx={x(last)} cy={y(current[last])} r="4.5" className="mc-dot" />
          </>
        )}
        {hi !== null && <line x1={x(hi)} x2={x(hi)} y1={TOP} y2={BOTTOM} className="mc-cross" />}
      </svg>
      <div className="mc-ticks" aria-hidden="true"><span>1</span><span>15</span><span>{days}</span></div>
      {budget > 0 && <span className="mc-budget-label" style={{ top: `${y(budget)}px` }}>Presupuesto</span>}
      {hi !== null && (
        <div className="mc-tip" style={{ left: `${Math.min(78, Math.max(22, (x(hi) / W) * 100))}%` }}>
          <strong>Día {hi + 1}</strong>
          {hCur !== null && <span><i className="sw cur" />{curLabel} {fmt(hCur)}</span>}
          {hPrev !== null && <span><i className="sw prev" />{prevLabel} {fmt(hPrev)}</span>}
        </div>
      )}
    </div>
  );
}
