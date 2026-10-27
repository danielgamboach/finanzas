import React from 'react';
import { Money } from '../../atoms/Money/Money';
import { Delta } from '../../molecules/Delta/Delta';
import './BalanceSummary.css';

export interface BalanceDelta {
  /** "12%" */
  value: string;
  /** Spending less is good (green), more is bad (red). */
  good: boolean;
  direction?: 'up' | 'down';
  /** "vs Septiembre" */
  vs: string;
  title?: string;
}

/**
 * The big number on Inicio: what went out in the period ("312.450 CRC"), the change against the
 * previous one ("↓12% vs Septiembre") and what's left of the month's budget ("102.023 CRC Disponible").
 */
export function BalanceSummary({ label, value, unit, negative, delta, available, action }: {
  label: React.ReactNode;
  value: string;
  unit?: string;
  negative?: boolean;
  delta?: BalanceDelta | null;
  available?: { value: string; unit?: string; negative?: boolean; label?: string } | null;
  action?: React.ReactNode;
}) {
  return (
    <section className="ds-balance" aria-label="Resumen">
      <span className="ds-balance__label">{label}</span>
      <Money value={value} unit={unit} size="large" tone={negative ? 'negative' : 'default'} />
      {(delta || available) && (
        <div className="ds-balance__meta">
          {delta && (
            <span className="ds-balance__delta" title={delta.title}>
              <Delta variant="arrow" value={delta.value} tone={delta.good ? 'good' : 'bad'} direction={delta.direction} />
              <span> {delta.vs}</span>
            </span>
          )}
          {delta && available && <span aria-hidden="true">·</span>}
          {available && (
            <span>
              <span className={available.negative ? 'ds-balance__avail is-neg' : 'ds-balance__avail'}>{available.value}{available.unit ? ` ${available.unit}` : ''}</span> {available.label ?? 'Disponible'}
            </span>
          )}
        </div>
      )}
      {action && <div className="ds-balance__actions">{action}</div>}
    </section>
  );
}
