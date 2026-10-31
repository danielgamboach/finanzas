import { useState } from 'react';
import { chargesToday, daysUntil, dueDay, dueLabel, isManual, justPaid, needsConfirm, recState, shortDay, undoPayRecurring, useRecurring } from '../lib/recurring';
import { PaySheet } from './PaySheet';
import { amount, unitOf } from '../lib/format';
import { namePhoto } from '../lib/merchants';
import type { Recurring } from '../lib/types';
import { go, useApp } from '../store';
import { PendingPaymentRow, PendingPayments as PendingPaymentsView } from '../ds';
import { CardPayment, recFace, useCardPayment } from '../screens/Recurrentes';
import { Holds } from './Holds';
import { SubAsk } from './SubAsk';

/**
 * Payments someone has to make by hand (transfers, cash) that are due or overdue, plus the shared
 * card payment. Each stays here until confirmed; once paid it shows as completed for a few days.
 * Renders nothing when there's nothing to pay.
 */
export function PendingPayments({ variant = 'sheet' }: { variant?: 'sheet' | 'card' }) {
  return (
    <div className={variant === 'card' ? 'highlights is-card' : 'highlights'}>
      <Holds variant={variant} />
      <SubAsk variant={variant} />
      <ManualPayments variant={variant} />
    </div>
  );
}

function ManualPayments(_: { variant: 'sheet' | 'card' }) {
  const { space, accounts } = useApp();
  const { items } = useRecurring(space?.id);
  // what was confirmed in this session, so it can be undone
  const [undo, setUndo] = useState<Record<string, { before: Recurring; txId: string }>>({});

  const pending = items.filter((r) => needsConfirm(r, accounts)).sort((a, b) => dueDay(a).localeCompare(dueDay(b)));
  const done = items.filter((r) => justPaid(r, accounts) && isManual(r));
  // automatic charges of today: only said, they register on their own (REC-08)
  const auto = items.filter(chargesToday);
  const card = useCardPayment();
  if (!pending.length && !done.length && !auto.length && !card) return null;

  const body = (
    <>
      {auto.map((r) => <AutoRow key={r.id} r={r} />)}
      {pending.map((r) => (
        <PendingRow key={r.id} r={r} onPaid={(txId) => txId && setUndo((u) => ({ ...u, [r.id]: { before: r, txId } }))} />
      ))}
      {done.map((r) => (
        <DoneRow key={r.id} r={r} undo={undo[r.id]} onUndone={() => setUndo((u) => {
          const { [r.id]: _, ...rest } = u;
          return rest;
        })} />
      ))}
    </>
  );

  const list = pending.length > 0 || done.length > 0 || auto.length > 0;
  return <PendingPaymentsView count={pending.length + (card ? 1 : 0)} top={card ? <CardPayment card={card} /> : null}>{list ? body : null}</PendingPaymentsView>;
}

function amountOf(r: Recurring, cur: 'CRC' | 'USD', fx: number) {
  const crc = r.currency === 'USD' ? Number(r.amount) * fx : Number(r.amount);
  // a dollar payment stays in dollars while the app shows colones
  const own = r.currency === 'USD' && cur === 'CRC';
  const num = own ? amount(Number(r.amount), 'USD', 1) : amount(crc, cur, fx);
  return <>{r.variable ? '≈ ' : ''}{num}<span className="amt-unit"> {own ? 'USD' : unitOf(cur)}</span></>;
}

/** One line: who, when, how much, and Pagar, which asks from which account (and offers postponing or ignoring it). */
function PendingRow({ r, onPaid }: { r: Recurring; onPaid: (txId: string | null) => void }) {
  const { categories, merchants, cur, fx } = useApp();
  const [open, setOpen] = useState(false);
  const photo = namePhoto(merchants, r.merchant, r.match_pattern);
  const overdue = recState({ ...r, next_due: dueDay(r) }) === 'overdue';

  return (
    <>
      <PendingPaymentRow
        state={overdue ? 'overdue' : 'due'}
        face={{ ...recFace(r, categories), color: categories.find((c) => c.id === r.category_id)?.color || 'gray', img: photo }}
        name={r.merchant}
        detail={dueLabel(dueDay(r))}
        amount={amountOf(r, cur, fx)}
        onOpen={() => go(`/recurrente/${r.id}`)}
        onPay={() => setOpen(true)}
        payText={r.kind === 'income' ? 'Cobré' : 'Pagar'}
        payLabel={`Pagar ${r.merchant}`}
      />
      {open && <PaySheet r={r} onClose={() => setOpen(false)} onPaid={onPaid} />}
    </>
  );
}

/** An automatic charge of today: "Hoy se cobra", or "Se registró hoy" once it's in. */
function AutoRow({ r }: { r: Recurring }) {
  const { categories, merchants, cur, fx } = useApp();
  const photo = namePhoto(merchants, r.merchant, r.match_pattern);
  const registered = !!r.last_paid_on && daysUntil(r.last_paid_on) === 0 && daysUntil(r.next_due) > 0;
  const when = registered ? 'Se registró hoy' : daysUntil(r.next_due) < 0 ? 'No llegó el voucher: se registra con el monto esperado' : r.kind === 'income' ? 'Hoy entra' : 'Hoy se cobra';
  return (
    <PendingPaymentRow
      state="info"
      face={{ ...recFace(r, categories), color: categories.find((c) => c.id === r.category_id)?.color || 'gray', img: photo }}
      name={r.merchant}
      detail={when}
      amount={amountOf(r, cur, fx)}
      onOpen={() => go(`/recurrente/${r.id}`)}
    />
  );
}

function DoneRow({ r, undo, onUndone }: { r: Recurring; undo?: { before: Recurring; txId: string }; onUndone: () => void }) {
  const { categories, merchants, cur, fx, toast, bump } = useApp();
  const [busy, setBusy] = useState(false);
  const photo = namePhoto(merchants, r.merchant, r.match_pattern);
  async function revert() {
    if (!undo) return;
    setBusy(true);
    try {
      await undoPayRecurring(undo.before, undo.txId);
      onUndone();
      toast(`${r.merchant} vuelve a pendientes`);
      bump();
    } finally {
      setBusy(false);
    }
  }
  return (
    <PendingPaymentRow
      state="done"
      face={{ ...recFace(r, categories), color: 'gray', img: photo }}
      name={r.merchant}
      detail={`Pagado · ${r.last_paid_on ? shortDay(r.last_paid_on) : 'hoy'}`}
      amount={amountOf(r, cur, fx)}
      onUndo={undo ? revert : undefined}
      busy={busy}
    />
  );
}
