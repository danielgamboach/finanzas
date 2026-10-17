import { useState } from 'react';
import { customKey, customParts, periodRange, PRESETS, recentMonths, shiftPeriod, type PeriodKey } from '../lib/period';
import { Icon, Sheet } from '.';

const todayStr = () => new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10);

/** "‹ 📅 Este mes ›" — tap the label to pick a preset, a month or custom dates. */
export function PeriodPicker({ value, onChange, weekStart }: { value: PeriodKey; onChange: (k: PeriodKey) => void; weekStart: number }) {
  const [open, setOpen] = useState(false);
  const parts = customParts(value);
  const [from, setFrom] = useState(parts?.[0] || todayStr().slice(0, 8) + '01');
  const [to, setTo] = useState(parts?.[1] || todayStr());
  const r = periodRange(value, weekStart);
  const prev = shiftPeriod(value, -1);
  const next = shiftPeriod(value, 1);
  const monthLike = value === 'month' || value === 'lastmonth' || value.startsWith('m:');
  const pick = (k: PeriodKey) => {
    onChange(k);
    setOpen(false);
  };

  return (
    <>
      <div className="period-nav">
        {monthLike && (
          <button className="icon-btn" onClick={() => prev && onChange(prev)} disabled={!prev} aria-label="Mes anterior">
            <Icon name="chevLeft" />
          </button>
        )}
        <button className="period-btn" onClick={() => setOpen(true)} aria-haspopup="dialog">
          <Icon name="calendar" size={18} />
          {r.label}
          <Icon name="chevDown" size={16} stroke={2.4} />
        </button>
        {monthLike && (
          <button className="icon-btn" onClick={() => next && onChange(next)} disabled={!next} aria-label="Mes siguiente">
            <Icon name="chevRight" />
          </button>
        )}
      </div>

      {open && (
        <Sheet title="Período" onClose={() => setOpen(false)}>
          <div className="period-grid">
            {PRESETS.map(([k, label]) => (
              <button key={k} className={value === k ? 'opt on' : 'opt'} aria-pressed={value === k} onClick={() => pick(k)}>{label}</button>
            ))}
          </div>
          <span className="field-label">Por mes</span>
          <div className="hscroll">
            {recentMonths().map(([k, label]) => (
              <button key={k} className={value === k ? 'filter on' : 'filter'} aria-pressed={value === k} onClick={() => pick(k)}>{label}</button>
            ))}
          </div>
          <span className="field-label">Personalizado</span>
          <div className="grid2">
            <label className="col gap6"><span className="hint">Desde</span><input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="col gap6"><span className="hint">Hasta</span><input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
          <button className="btn-dark" disabled={!from || !to || from > to} onClick={() => pick(customKey(from, to))}>Ver este rango</button>
        </Sheet>
      )}
    </>
  );
}
