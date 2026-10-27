import React from 'react';
import './Stat.css';

/** A figure with its label and an optional Delta (Análisis, Cuentas, desktop). */
export function Stat({ label, value, delta, size = 'md', className }: { label: React.ReactNode; value: React.ReactNode; delta?: React.ReactNode; size?: 'md' | 'lg'; className?: string }) {
  return (
    <div className={['ds-stat', `ds-stat--${size}`, className].filter(Boolean).join(' ')}>
      <span className="ds-stat__label">{label}</span>
      <span className="ds-stat__row"><span className="ds-stat__value">{value}</span>{delta}</span>
    </div>
  );
}
