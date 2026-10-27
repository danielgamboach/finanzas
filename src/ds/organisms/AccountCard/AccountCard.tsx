import React from 'react';
import './AccountCard.css';

export type AccountColor = 'graphite' | 'emerald' | 'cyan' | 'yellow' | 'violet' | 'coral' | 'blue' | 'sand';

/** An account in its color (tokens account-*). peek: seen edge-on on Inicio. */
export function AccountCard({ color = 'graphite', className, style, id }: { color?: AccountColor | string; className?: string; style?: React.CSSProperties; id?: string }) {
  return <span className={['ds-acard', className].filter(Boolean).join(' ')} data-acc={id} style={{ background: `var(--account-${color})`, ...style }} />;
}

/** The first accounts stacked, peeking from the right edge of Inicio. Takes you to Cuentas. */
export function AccountStack({ accounts, onClick, label = 'Ver cuentas', className }: { accounts: { id?: string; color?: string | null }[]; onClick?: () => void; label?: string; className?: string }) {
  return (
    <button type="button" className={['ds-astack', className].filter(Boolean).join(' ')} onClick={onClick} aria-label={label}>
      {accounts.slice(0, 3).map((a, i) => <AccountCard key={a.id || i} id={a.id} color={a.color || 'graphite'} style={{ left: i * 19, zIndex: i }} />)}
    </button>
  );
}
