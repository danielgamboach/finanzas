import React from 'react';
import './Money.css';

export type MoneySize = 'hero' | 'large' | 'row';
export type MoneyTone = 'default' | 'positive' | 'negative' | 'muted';

/**
 * An amount already formatted ("¢312.450", "−¢56.200", "+$12,40").
 * hero: the symbol goes small and high (form), large: the big number on Inicio, row: lists.
 */
export function Money({ value, size = 'row', tone = 'default', strike, className }: { value: string; size?: MoneySize; tone?: MoneyTone; strike?: boolean; className?: string }) {
  const cls = ['ds-money', `ds-money--${size}`, `ds-money--${tone}`, strike && 'ds-money--strike', className].filter(Boolean).join(' ');
  if (size !== 'hero') return <span className={cls}>{value}</span>;
  const m = value.match(/^([+−-]?)([^\d]*)(.*)$/);
  const [, sign = '', sym = '', num = value] = m || [];
  return (
    <span className={cls}>
      {sign && <span className="ds-money__sym">{sign}</span>}
      {sym && <span className="ds-money__sym">{sym}</span>}
      <span>{num}</span>
    </span>
  );
}
