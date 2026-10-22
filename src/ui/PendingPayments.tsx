import { useState } from 'react';
import { addPeriod, dueLabel, isManual, justPaid, needsConfirm, payRecurring, recState, shortDay, skipRecurring, undoPayRecurring, useRecurring } from '../lib/recurring';
import { money, moneyRaw } from '../lib/format';
import { photoFor, photoUrl } from '../lib/photos';
import type { Recurring } from '../lib/types';
import { go, useApp } from '../store';
import { Emo, Icon } from '.';
import { CardPayment, recEmoji } from '../screens/Recurrentes';

/**
 * Payments someone has to make by hand (transfers, cash) that are due or overdue, plus the shared
 * card payment. Each stays here until confirmed; once paid it shows as completed for a few days.
 * Renders nothing when there's nothing to pay.
 */
export function PendingPayments({ variant = 'sheet' }: { variant?: 'sheet' | 'card' }) {
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
          {pending.length > 0 ? <span className="pp-count">{pending.length}</span> : <span className="pp-ok"><Icon name="check" size={14} stroke={2.8} />Al día</span>}
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

function PendingRow({ r, onPaid }: { r: Recurring; onPaid: (txId: string | null) => void }) {
  const { categories, accounts, photos, cur, fx, userId, toast, bump } = useApp();
  const [busy, setBusy] = useState(false);
  const photo = photoFor(photos, r.merchant, r.match_pattern);
  const acc = accounts.find((a) => a.id === r.account_id);
  const overdue = recState(r) === 'overdue';
  const from = acc ? `desde ${acc.name}${acc.last4 ? ` ••${acc.last4}` : ''}` : r.method === 'cash' ? 'en efectivo' : 'por transferencia';

  async function paid() {
    setBusy(true);
    try {
      const txId = await payRecurring(r, fx, userId);
      onPaid(txId);
      toast(`✅ ${r.merchant} completado`);
      bump();
    } catch {
      toast('No se pudo registrar el pago');
    } finally {
      setBusy(false);
    }
  }
  async function skip() {
    setBusy(true);
    try {
      await skipRecurring(r);
      toast(`Saltado · el próximo es el ${shortDay(addPeriod(r.next_due, r.frequency))}`);
      bump();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={overdue ? 'pp-row overdue' : 'pp-row'}>
      <button className="pp-main" onClick={() => go(`/recurrente/${r.id}`)}>
        <Emo e={recEmoji(r, categories)} color={overdue ? 'pink' : categories.find((c) => c.id === r.category_id)?.color || 'gray'} img={photo ? photoUrl(photo) : null} size={44} />
        <span className="pp-mid">
          <span className="pp-name">{r.merchant}</span>
          <span className="pp-sub">{dueLabel(r.next_due)} · {from}</span>
        </span>
        <span className="pp-amt">{amountOf(r, cur, fx)}</span>
      </button>
      <div className="pp-actions">
        <button className="pp-skip" onClick={skip} disabled={busy}>{r.frequency === 'monthly' ? 'Saltar este mes' : 'Saltar esta vez'}</button>
        <button className="btn-dark sm" onClick={paid} disabled={busy}>
          <Icon name="check" size={16} stroke={2.6} />
          Ya lo pagué
        </button>
      </div>
    </div>
  );
}

function DoneRow({ r, undo, onUndone }: { r: Recurring; undo?: { before: Recurring; txId: string }; onUndone: () => void }) {
  const { categories, photos, cur, fx, toast, bump } = useApp();
  const [busy, setBusy] = useState(false);
  const photo = photoFor(photos, r.merchant, r.match_pattern);
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
          <Emo e={recEmoji(r, categories)} color="gray" img={photo ? photoUrl(photo) : null} size={44} />
          <span className="pp-check" aria-hidden="true"><Icon name="check" size={12} stroke={3} /></span>
        </span>
        <span className="pp-mid">
          <span className="pp-name">{r.merchant}</span>
          <span className="pp-sub pos">Completado · {r.last_paid_on ? shortDay(r.last_paid_on) : 'hoy'}</span>
        </span>
        <span className="pp-amt muted">{amountOf(r, cur, fx)}</span>
      </div>
      {undo && (
        <div className="pp-actions">
          <button className="pp-skip" onClick={revert} disabled={busy}>Deshacer</button>
        </div>
      )}
    </div>
  );
}
