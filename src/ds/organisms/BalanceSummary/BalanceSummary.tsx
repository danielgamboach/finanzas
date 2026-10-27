import React from 'react';
import { Money } from '../../atoms/Money/Money';
import { Delta } from '../../molecules/Delta/Delta';
import './BalanceSummary.css';

/**
 * The big number on Inicio. available: budget minus spent. over: went past it (red). spent: no budget, what went out.
 * The change compares with the same day last month; green when it's going better.
 */
export function BalanceSummary({ label, value, negative, delta, deltaTitle, action }: { label: React.ReactNode; value: string; negative?: boolean; delta?: { text: string; good: boolean } | null; deltaTitle?: string; action?: React.ReactNode }) {
  return (
    <section className="ds-balance" aria-label="Resumen del mes">
      <span className="ds-balance__label">{label}</span>
      <div className="ds-balance__row">
        <Money value={value} size="large" tone={negative ? 'negative' : 'default'} />
        {delta && <Delta variant="text" value={delta.text} tone={delta.good ? 'good' : 'bad'} title={deltaTitle} />}
      </div>
      {action && <div className="ds-balance__actions">{action}</div>}
    </section>
  );
}
