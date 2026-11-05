import { useEffect, useState } from 'react';
import { ActionBar, Button, ListGroup, ListRow } from '../ds';
import { db } from '../lib/api';
import { fromInputDateTime, moneyRaw, parseAmount, toInputDateTime } from '../lib/format';
import { addPeriod, cancelRecurring, dueDay, missedCharge, freqLabel, payRecurring, shortDay, skipRecurring, snoozeRecurring } from '../lib/recurring';
import { canPay, canReceiveIncome, canSendMoney } from '../lib/transfers';
import type { Recurring, Tx } from '../lib/types';
import { TX_SELECT, useApp } from '../store';
import { TxFace } from './TxRow';
import { Icon, Sheet } from '.';
import { CardPaySheet } from './CardPay';

const tomorrow = () => new Date(Date.now() - 6 * 3600000 + 86400000).toISOString().slice(0, 10);

/**
 * Paying a manual recurrent (REC-06): from which account, how much and when, with the recurrent's own as defaults.
 * Below, the other ways out (REC-07): ignore this one, postpone it, or stop the recurrent.
 */
export function PaySheet(props: { r: Recurring; onClose: () => void; onPaid: (txId: string | null) => void }) {
  const { accounts } = useApp();
  const to = accounts.find((a) => a.id === props.r.to_account_id);
  // paying a credit card (an early payment, TAR-05): how much was paid, in which currency, with what's owed in view
  if (props.r.kind === 'transfer' && to?.kind === 'credit_card') return <CardPaySheet cardId={to.parent_account_id || to.id} r={props.r} onClose={props.onClose} onPaid={props.onPaid} />;
  return <PlainPaySheet {...props} />;
}

function PlainPaySheet({ r, onClose, onPaid }: { r: Recurring; onClose: () => void; onPaid: (txId: string | null) => void }) {
  const { accounts, fx, userId, toast, bump } = useApp();
  const usable = accounts.filter((a) => !a.archived && (r.kind === 'income' ? canReceiveIncome(a) : r.kind === 'transfer' ? canSendMoney(a) && a.id !== r.to_account_id : canPay(a)));
  const cash = accounts.find((a) => a.system === 'cash');
  const [accountId, setAccountId] = useState(usable.some((a) => a.id === r.account_id) ? r.account_id! : cash?.id || usable[0]?.id || '');
  const [amt, setAmt] = useState(() => {
    const [i, d] = Number(r.amount).toFixed(2).split('.');
    return i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d !== '00' ? `,${d}` : '');
  });
  // a missed automatic charge happened on its day, not now
  const [when, setWhen] = useState(toInputDateTime(missedCharge(r) ? `${dueDay(r)}T18:00:00.000Z` : new Date().toISOString()));
  const [later, setLater] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const num = parseAmount(amt);
  const verb = r.kind === 'income' ? 'cobro' : 'pago';
  // it may already be registered (a voucher with another name, or entered by hand): offer those to link (REC-06)
  const [found, setFound] = useState<Tx[]>([]);
  useEffect(() => {
    const from = new Date(new Date(`${dueDay(r)}T12:00:00Z`).getTime() - 10 * 86400000).toISOString();
    db.from<Tx>('transactions', TX_SELECT).eq('space_id', r.space_id).eq('kind', r.kind).eq('currency', r.currency).is('recurring_id', null).gte('occurred_at', from)
      .order('occurred_at', false).limit(40)
      .then((rows) => setFound(rows.filter((x) => (x as { visible?: boolean }).visible !== false && (r.variable || Math.abs(Number(x.amount) - Number(r.amount)) <= Number(r.amount) * 0.1)).slice(0, 4)))
      .catch(() => setFound([]));
  }, [r.id]);

  async function run(fn: () => Promise<void>, msg: string) {
    setBusy(true);
    try {
      await fn();
      toast(msg);
      bump();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  const pay = () => run(async () => {
    const txId = await payRecurring(r, fx, userId, { accountId, amount: Math.round(num * 100) / 100, when: fromInputDateTime(when) });
    onPaid(txId);
  }, `${r.merchant}: ${r.kind === 'income' ? 'cobrado' : 'pagado'}`);
  const link = (x: Tx) => run(async () => {
    await db.update('transactions', { id: x.id }, { recurring_id: r.id });
    onPaid(null);
  }, `${r.merchant}: ${r.kind === 'income' ? 'cobrado' : 'pagado'} el ${shortDay(x.occurred_at.slice(0, 10))}`);
  const skip = () => run(() => skipRecurring(r), `Ignorado · próximo ${shortDay(addPeriod(r.next_due, r.frequency, r.every_n, r.every_unit))}`);
  const snooze = () => later && run(() => snoozeRecurring(r, later), `Pospuesto para el ${shortDay(later)}`);
  const cancel = () => confirm(`¿Dejar de repetir ${r.merchant}? Queda en pausados y lo podés reactivar.`) && run(() => cancelRecurring(r), `${r.merchant} ya no se repite`);

  return (
    <Sheet title={r.merchant} onClose={onClose}>
      <p className="page-text">
        {freqLabel(r)} · vence el {shortDay(dueDay(r))} · {r.variable ? '≈ ' : ''}{moneyRaw(Number(r.amount), r.currency)}
      </p>
      {found.length > 0 && (
        <ListGroup title="¿Ya está registrado?" note={`Si es uno de estos, se liga a ${r.merchant} y no se registra otro.`}>
          {found.map((x) => (
            <ListRow key={x.id} leading={<TxFace t={x} size={40} />} title={x.merchant || 'Movimiento'}
              detail={`${shortDay(x.occurred_at.slice(0, 10))}${x.raw_merchant ? ` · ${x.raw_merchant}` : ''}`}
              actions={<Button variant="secondary" size="xs" disabled={busy} onClick={() => link(x)}>Es este</Button>}
              value={moneyRaw(Number(x.amount), x.currency)} />
          ))}
        </ListGroup>
      )}
      <div className="field-card">
        <label className="field-row">
          <span>{r.kind === 'income' ? 'Entró a' : 'Desde'}</span>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Cuenta">
            {usable.map((a) => <option key={a.id} value={a.id}>{a.name}{a.last4 ? ` ••${a.last4}` : ''}</option>)}
          </select>
        </label>
        <label className="field-row">
          <span>Monto ({r.currency})</span>
          <input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9.,]/g, ''))} aria-label="Monto" />
        </label>
        <label className="field-row">
          <span>Fecha</span>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
      </div>
      <ListGroup>
        {later === null ? (
          <button type="button" className="pay-alt" onClick={() => setLater(tomorrow())} disabled={busy}>
            <Icon name="clock" size={16} /> Posponer
          </button>
        ) : (
          <div className="pay-alt pay-later">
            <label className="col gap6">
              <span className="field-label">Recordarme el</span>
              <input className="input" type="date" min={tomorrow()} value={later} onChange={(e) => setLater(e.target.value)} />
            </label>
            <Button variant="secondary" size="sm" onClick={snooze} disabled={busy || !later}>Posponer</Button>
          </div>
        )}
        <button type="button" className="pay-alt" onClick={skip} disabled={busy}>
          <Icon name="arrowRight" size={16} /> Ignorar este {verb}
        </button>
        <button type="button" className="pay-alt danger" onClick={cancel} disabled={busy}>
          <Icon name="close" size={16} /> Dejar de repetir
        </button>
      </ListGroup>
      <ActionBar>
        <Button variant="primary" size="lg" block disabled={busy || !(num > 0) || !accountId} onClick={pay}>
          Registrar {verb}
        </Button>
      </ActionBar>
    </Sheet>
  );
}
