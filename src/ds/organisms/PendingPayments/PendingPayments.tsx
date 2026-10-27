import React from 'react';
import { Avatar, type AvatarProps } from '../../atoms/Avatar/Avatar';
import { Badge } from '../../atoms/Badge/Badge';
import { Button } from '../../atoms/Button/Button';
import { Icon } from '../../atoms/Icon/Icon';
import './PendingPayments.css';

/** The block of manual payments due (Inicio sheet, Recurrentes). Only shown when there's something to pay. */
export function PendingPayments({ title = 'Pagos pendientes', count, children, top }: { title?: React.ReactNode; count?: number; children?: React.ReactNode; top?: React.ReactNode }) {
  return (
    <section className="ds-pp" aria-label={typeof title === 'string' ? title : 'Pagos pendientes'}>
      {children && (
        <div className="ds-pp__head">
          <span>{title}</span>
          {count ? <Badge count={count} /> : null}
        </div>
      )}
      {top}
      {children && <div className="ds-pp__list">{children}</div>}
    </section>
  );
}

/** One manual payment. due/overdue: a check confirms it. done: paid recently, with Deshacer. */
export function PendingPaymentRow({ state = 'due', face, name, detail, amount, onOpen, onPay, onUndo, busy, payLabel }: {
  state?: 'due' | 'overdue' | 'done'; face: AvatarProps; name: React.ReactNode; detail: React.ReactNode; amount: React.ReactNode;
  onOpen?: () => void; onPay?: () => void; onUndo?: () => void; busy?: boolean; payLabel?: string;
}) {
  const main = (
    <>
      <span className="ds-pp__face">
        <Avatar size="md" {...face} />
        {state === 'done' && <span className="ds-pp__check" aria-hidden="true"><Icon name="check" size={12} /></span>}
      </span>
      <span className="ds-pp__mid">
        <span className="ds-pp__name">{name}</span>
        <span className={`ds-pp__sub is-${state}`}>{detail}</span>
      </span>
      <span className="ds-pp__amt">{amount}</span>
    </>
  );
  return (
    <div className={`ds-pp__row is-${state}`}>
      {onOpen ? <button type="button" className="ds-pp__main" onClick={onOpen}>{main}</button> : <div className="ds-pp__main">{main}</div>}
      {state === 'done'
        ? onUndo && <Button variant="ghost" size="xs" onClick={onUndo} disabled={busy}>Deshacer</Button>
        : onPay && <Button variant="outline" size="sm" iconOnly aria-label={payLabel} onClick={onPay} disabled={busy}><Icon name="check" size={18} /></Button>}
    </div>
  );
}
