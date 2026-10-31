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

/**
 * One payment. due/overdue: the button ("Pagar" by default) pays it. done: paid recently, with Deshacer.
 * info: an automatic charge for today, only said (no button).
 */
export function PendingPaymentRow({ state = 'due', face, name, detail, amount, onOpen, onPay, onUndo, busy, payLabel, payText = 'Pagar', density }: {
  state?: 'due' | 'overdue' | 'done' | 'info'; face: AvatarProps; name: React.ReactNode; detail: React.ReactNode; amount: React.ReactNode;
  onOpen?: () => void; onPay?: () => void; onUndo?: () => void; busy?: boolean; payLabel?: string; payText?: string; density?: 'md' | 'sm';
}) {
  const actions = state === 'done'
    ? onUndo && <Button variant="ghost" size="xs" onClick={onUndo} disabled={busy}>Deshacer</Button>
    : state === 'info' ? null
    : onPay && <Button variant="primary" size="xs" aria-label={payLabel} onClick={(e) => { e.stopPropagation(); onPay(); }} disabled={busy}>{payText}</Button>;
  return (
    <ListRow
      leading={<Avatar size="md" {...face} />}
      title={name}
      detail={<><span className={`ds-pp__when is-${state}`}>{detail}</span> · {amount}</>}
      actions={actions || undefined}
      quiet={state === 'done' || state === 'info'}
      density={density}
      onClick={onOpen}
    />
  );
}
