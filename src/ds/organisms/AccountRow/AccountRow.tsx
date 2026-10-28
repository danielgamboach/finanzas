import React from 'react';
import { ListGroup, ListRow } from '../../molecules/ListGroup/ListGroup';

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

/** One account in Cuentas: kind icon in its color, name and details, balance and a chevron. A ListRow underneath. */
export function AccountRow({ icon, color, name, details, amount, amountMuted, delta, href, onClick }: AccountRowProps) {
  return (
    <ListRow
      leading={<ListRow.Icon name={icon} color={color} />}
      title={name}
      detail={details}
      value={amount}
      valueTone={amountMuted ? 'muted' : 'default'}
      valueDetail={delta?.text}
      valueDetailTone={delta?.tone === 'negative' ? 'destructive' : 'success'}
      chevron={!!(href || onClick)}
      href={href}
      onClick={onClick}
    />
  );
}

/** A titled group of accounts ("Tarjetas de crédito") in one rounded list. */
export function AccountGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <ListGroup title={title}>{children}</ListGroup>;
}
