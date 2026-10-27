import React from 'react';
import { Avatar, type AvatarProps } from '../../atoms/Avatar/Avatar';
import { Checkbox } from '../../atoms/Checkbox/Checkbox';
import './TxRow.css';

export type TxAmountTone = 'default' | 'positive' | 'muted' | 'void';

export interface TxRowProps {
  face: AvatarProps;
  name: React.ReactNode;
  /** "Hoy · Supermercado". Pass a node for the category picker of "Por revisar". */
  detail?: React.ReactNode;
  /** warning: to review or pending hold. */
  detailTone?: 'default' | 'warning';
  amount: React.ReactNode;
  amountTone?: TxAmountTone;
  /** sheet: Inicio sheet (14/500, face 40). list: Movimientos (16/500, face 48). */
  context?: 'sheet' | 'list';
  onClick?: () => void;
  /** Bulk selection: a check in front and the whole row toggles. */
  selected?: boolean;
  selecting?: boolean;
  className?: string;
}

/** One movement: face, merchant, date and category, amount. */
export function TxRow({ face, name, detail, detailTone = 'default', amount, amountTone = 'default', context = 'list', onClick, selected, selecting, className }: TxRowProps) {
  const cls = ['ds-tx', `ds-tx--${context}`, selecting && 'is-selecting', selected && 'is-selected', className].filter(Boolean).join(' ');
  const inner = (
    <>
      {selecting && <Checkbox checked={!!selected} />}
      <Avatar size={context === 'sheet' ? 'md' : 'lg'} {...face} />
      <span className="ds-tx__mid">
        <span className="ds-tx__name">{name}</span>
        {detail && <span className={detailTone === 'warning' ? 'ds-tx__detail is-warning' : 'ds-tx__detail'}>{detail}</span>}
      </span>
      <span className={`ds-tx__amt is-${amountTone}`}>{amount}</span>
    </>
  );
  // a row with an interactive detail (category picker) can't be a button: the name opens it instead
  if (!onClick) return <div className={cls}>{inner}</div>;
  return <button type="button" className={cls} onClick={onClick} aria-pressed={selecting ? !!selected : undefined}>{inner}</button>;
}
