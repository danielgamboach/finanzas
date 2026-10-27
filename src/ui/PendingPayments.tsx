import { useState } from 'react';
import { dueLabel, isManual, justPaid, needsConfirm, payRecurring, recState, shortDay, undoPayRecurring, useRecurring } from '../lib/recurring';
import { amount, unitOf } from '../lib/format';
import { namePhoto } from '../lib/merchants';
import type { Recurring } from '../lib/types';
import { go, useApp } from '../store';
import { PendingPaymentRow, PendingPayments as PendingPaymentsView } from '../ds';
import { CardPayment, recEmoji } from '../screens/Recurrentes';
import { Holds } from './Holds';

/**
 * Payments someone has to make by hand (transfers, cash) that are due or overdue, plus the shared
 * card payment. Each stays here until confirmed; once paid it shows as completed for a few days.
 * Renders nothing when there's nothing to pay.
 */
export function PendingPayments({ variant = 'sheet' }: { variant?: 'sheet' | 'card' }) {
  return (
    <>
      <Holds variant={variant} />
      <ManualPayments variant={variant} />
    </>
  );
}

function ManualPayments({ variant }: { variant: 'sheet' | 'card' }) {
  const { space, accounts } = useApp();
  const { items } = useRecurring(space?.id);
  // what was confirmed in this session, so it can be undone
  const [undo, setUndo] = useState<Record<string, { before: Recurring; txId: string }>>({});

  const pending = items.filter((r) => needsConfirm(r, accounts)).sort((a, b) => a.next_due.localeCompare(b.next_due));
  const done = items.filter((r) => justPaid(r, accounts) && isManual(r));
  const card = space?.kind === 'shared';
  if (!pending.length && !done.length && !card) return null;

  const body = (
    <>
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

  const list = pending.length > 0 || done.length > 0;
  return (
    <div className={variant === 'card' ? 'pp-wrap pp-card' : 'pp-wrap'}>
      <PendingPaymentsView count={pending.length} top={card ? <CardPayment /> : null}>{list ? body : null}</PendingPaymentsView>
    </div>
  );
}

function amountOf(r: Recurring, cur: 'CRC' | 'USD', fx: number) {
  const crc = r.currency === 'USD' ? Number(r.amount) * fx : Number(r.amount);
  // a dollar payment stays in dollars while the app shows colones
  const own = r.currency === 'USD' && cur === 'CRC';
  const num = own ? amount(Number(r.amount), 'USD', 1) : amount(crc, cur, fx);
  return <>{r.variable ? '≈ ' : ''}{num}<span className="amt-unit"> {own ? 'USD' : unitOf(cur)}</span></>;
}

/** One line: who, when, how much, and a check to confirm it was paid. Skipping lives in Recurrentes. */
function PendingRow({ r, onPaid }: { r: Recurring; onPaid: (txId: string | null) => void }) {
  const { categories, merchants, cur, fx, userId, toast, bump } = useApp();
  const [busy, setBusy] = useState(false);
  const photo = namePhoto(merchants, r.merchant, r.match_pattern);
  const overdue = recState(r) === 'overdue';

  async function paid() {
    setBusy(true);
    try {
      const txId = await payRecurring(r, fx, userId);
      onPaid(txId);
      toast(`✅ ${r.merchant} pagado`);
      bump();
    } catch {
      toast('No se pudo registrar el pago');
    } finally {
      setBusy(false);
    }
  }

  return (
    <PendingPaymentRow
      state={overdue ? 'overdue' : 'due'}
      face={{ emoji: recEmoji(r, categories), color: categories.find((c) => c.id === r.category_id)?.color || 'gray', img: photo }}
      name={r.merchant}
      detail={dueLabel(r.next_due)}
      amount={amountOf(r, cur, fx)}
      onOpen={() => go(`/recurrente/${r.id}`)}
      onPay={paid}
      busy={busy}
      payLabel={`Ya pagué ${r.merchant}`}
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
      face={{ emoji: recEmoji(r, categories), color: 'gray', img: photo }}
      name={r.merchant}
      detail={`Pagado · ${r.last_paid_on ? shortDay(r.last_paid_on) : 'hoy'}`}
      amount={amountOf(r, cur, fx)}
      onUndo={undo ? revert : undefined}
      busy={busy}
    />
  );
}
