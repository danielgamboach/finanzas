import React from 'react';
import { Avatar, type AvatarProps } from '../../atoms/Avatar/Avatar';
import { Button } from '../../atoms/Button/Button';
import { ListGroup, ListRow } from '../../molecules/ListGroup/ListGroup';

/** The group of manual payments due (Inicio sheet, Recurrentes). Only shown when there's something to pay. */
export function PendingPayments({ title = 'Pagos pendientes', count, children, top }: { title?: React.ReactNode; count?: number; children?: React.ReactNode; top?: React.ReactNode }) {
  if (!children && !top) return null;
  return (
    <ListGroup title={title} count={count}>
      {top}
      {children}
    </ListGroup>
  );
}

/** One manual payment. due/overdue: "Pagué" confirms it. done: paid recently, with Deshacer. */
export function PendingPaymentRow({ state = 'due', face, name, detail, amount, onOpen, onPay, onUndo, busy, payLabel, density }: {
  state?: 'due' | 'overdue' | 'done'; face: AvatarProps; name: React.ReactNode; detail: React.ReactNode; amount: React.ReactNode;
  onOpen?: () => void; onPay?: () => void; onUndo?: () => void; busy?: boolean; payLabel?: string; density?: 'md' | 'sm';
}) {
  const actions = state === 'done'
    ? onUndo && <Button variant="ghost" size="xs" onClick={onUndo} disabled={busy}>Deshacer</Button>
    : onPay && <Button variant="primary" size="xs" aria-label={payLabel} onClick={onPay} disabled={busy}>Pagué</Button>;
  return (
    <ListRow
      leading={<Avatar size="md" {...face} />}
      title={name}
      detail={<><span className={`ds-pp__when is-${state}`}>{detail}</span> · {amount}</>}
      actions={actions || undefined}
      quiet={state === 'done'}
      density={density}
      onClick={onOpen}
    />
  );
}
