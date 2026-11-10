import React from 'react';
import { Money } from '../../atoms/Money/Money';
import './MonthPulse.css';

export interface PulseStat {
  label: React.ReactNode;
  value: string;
  unit?: string;
  /** A Delta or any short note after the value. */
  note?: React.ReactNode;
}

/**
 * The top of Inicio (PRM-13): what's free this month in big, a bar of the month where the fill is what
 * went out of (gastado + libre) and a tick marks today, and two figures side by side (por día, gastado).
 * When the fill passes the tick the bar warns: money is going faster than the days.
 */
export function MonthPulse({ label, value, unit, negative, used, today, start, end, stats }: {
  label: React.ReactNode;
  value: string;
  unit?: string;
  negative?: boolean;
  /** 0..1, share of the month's money already used. */
  used: number;
  /** 0..1, share of the month already gone. */
  today: number;
  start: string;
  end: string;
  stats: PulseStat[];
}) {
  const u = Math.max(0, Math.min(1, used)), t = Math.max(0, Math.min(1, today));
  const tone = negative || u >= 1 ? 'over' : u > t + 0.05 ? 'fast' : 'ok';
  const status = tone === 'over' ? 'Sin margen' : tone === 'fast' ? 'Más rápido que el mes' : 'A buen ritmo';
  return (
    <section className={`ds-pulse is-${tone}`} aria-label="Resumen del mes">
      <div className="ds-pulse__head">
        <span className="ds-pulse__label">{label}</span>
        <span className="ds-pulse__status"><span className="ds-pulse__dot" aria-hidden="true" />{status}</span>
      </div>
      <Money value={value} unit={unit} size="large" tone={negative ? 'negative' : 'default'} />
      <div className="ds-pulse__bar" role="img" aria-label={`Usado ${Math.round(u * 100)}% del dinero con ${Math.round(t * 100)}% del mes`}>
        <span className="ds-pulse__fill" style={{ width: `${u * 100}%` }} />
        <span className="ds-pulse__tick" style={{ left: `${t * 100}%` }} />
      </div>
      <div className="ds-pulse__ends"><span>{start}</span><span className="ds-pulse__today" style={{ left: `${t * 100}%` }}>Hoy</span><span>{end}</span></div>
      <dl className="ds-pulse__stats">
        {stats.map((s, i) => (
          <div key={i} className="ds-pulse__stat">
            <dt>{s.label}</dt>
            <dd><span className="ds-pulse__num">{s.value}</span>{s.unit && <span className="ds-pulse__unit"> {s.unit}</span>}{s.note && <span className="ds-pulse__note">{s.note}</span>}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
