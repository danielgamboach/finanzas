import React from 'react';
import { Icon } from '../../atoms/Icon/Icon';
import './AccountRow.css';

export interface AccountRowProps {
  /** Filled icon of the account kind: cards, bank, piggy, chartHistogram, lock, wallet, receipt, folder. */
  icon: string;
  /** The account's color (a --account-* token), used on the icon. */
  color?: string;
  name: React.ReactNode;
  /** Small facts joined with " · ": currency, kind, last digits. */
  details?: string[];
  /** Balance, or what's owed on a card: "2.250 USD", "¢350.000". */
  amount: React.ReactNode;
  /** Quiet amount (no balance yet). */
  amountMuted?: boolean;
  /** Change since the previous balance, under the amount: "+$3,51 (+0,15%)". */
  delta?: { text: string; tone: 'positive' | 'negative' };
  href?: string;
  onClick?: () => void;
}

/** One account in Cuentas: kind icon in its color, name and details, balance and a chevron. */
export function AccountRow({ icon, color, name, details, amount, amountMuted, delta, href, onClick }: AccountRowProps) {
  const body = (
    <>
      <span className="ds-acc-row__icon" style={color ? { color } : undefined} aria-hidden="true"><Icon name={icon} size={16} solid /></span>
      <span className="ds-acc-row__text">
        <span className="ds-acc-row__name">{name}</span>
        {details && details.length > 0 && <span className="ds-acc-row__details">{details.filter(Boolean).join(' · ')}</span>}
      </span>
      <span className="ds-acc-row__end">
        <span className="ds-acc-row__fig">
          <span className={amountMuted ? 'ds-acc-row__amt is-muted' : 'ds-acc-row__amt'}>{amount}</span>
          {delta && <span className={`ds-acc-row__delta is-${delta.tone}`}>{delta.text}</span>}
        </span>
        <span className="ds-acc-row__chev" aria-hidden="true"><Icon name="angleRight" size={12} stroke={2.4} /></span>
      </span>
    </>
  );
  if (href) return <a className="ds-acc-row" href={href}>{body}</a>;
  if (onClick) return <button type="button" className="ds-acc-row" onClick={onClick}>{body}</button>;
  return <div className="ds-acc-row">{body}</div>;
}

/** A titled group of accounts ("Tarjetas de crédito") in one rounded list. */
export function AccountGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="ds-acc-group" aria-label={title}>
      <h2 className="ds-acc-group__head">{title}</h2>
      <div className="ds-acc-group__list">{children}</div>
    </section>
  );
}
