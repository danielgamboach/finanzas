import { useState } from 'react';
import { dueLabel, isManual, justPaid, needsConfirm, payRecurring, recState, shortDay, undoPayRecurring, useRecurring } from '../lib/recurring';
import { money, moneyRaw } from '../lib/format';
import { namePhoto } from '../lib/merchants';
import type { Recurring } from '../lib/types';
import { go, useApp } from '../store';
import { Emo, Icon } from '.';
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

  return (
    <section className={variant === 'card' ? 'pp pp-card' : 'pp'} aria-label="Pagos pendientes">
      {(pending.length > 0 || done.length > 0) && (
        <div className="pp-head">
          <span>Pagos pendientes</span>
          {pending.length > 0 && <span className="pp-count">{pending.length}</span>}
        </div>
      )}
      {card && <CardPayment />}
      {(pending.length > 0 || done.length > 0) && <div className="pp-list">{body}</div>}
    </section>
  );
}

function amountOf(r: Recurring, cur: 'CRC' | 'USD', fx: number) {
  const crc = r.currency === 'USD' ? Number(r.amount) * fx : Number(r.amount);
  return r.currency === 'USD' && cur === 'CRC' ? moneyRaw(Number(r.amount), 'USD') : money(crc, cur, fx);
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
    <div className={overdue ? 'pp-row overdue' : 'pp-row'}>
      <button className="pp-main" onClick={() => go(`/recurrente/${r.id}`)}>
        <Emo e={recEmoji(r, categories)} color={categories.find((c) => c.id === r.category_id)?.color || 'gray'} img={photo} size={40} />
        <span className="pp-mid">
          <span className="pp-name">{r.merchant}</span>
          <span className="pp-sub">{dueLabel(r.next_due)}</span>
        </span>
        <span className="pp-amt">{amountOf(r, cur, fx)}</span>
      </button>
      <button className="pp-pay" onClick={paid} disabled={busy} aria-label={`Ya pagué ${r.merchant}`}>
        <Icon name="check" size={18} stroke={2.6} />
        <span className="pp-pay-label">Ya lo pagué</span>
      </button>
    </div>
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
    <div className="pp-row done">
      <div className="pp-main">
        <span className="pp-emo-done">
          <Emo e={recEmoji(r, categories)} color="gray" img={photo} size={40} />
          <span className="pp-check" aria-hidden="true"><Icon name="check" size={12} stroke={3} /></span>
        </span>
        <span className="pp-mid">
          <span className="pp-name">{r.merchant}</span>
          <span className="pp-sub pos">Pagado · {r.last_paid_on ? shortDay(r.last_paid_on) : 'hoy'}</span>
        </span>
        <span className="pp-amt muted">{amountOf(r, cur, fx)}</span>
      </div>
      {undo && <button className="pp-undo" onClick={revert} disabled={busy}>Deshacer</button>}
    </div>
  );
}
