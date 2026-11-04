import { useState } from 'react';
import { ActionBar, Button, Chip, ListGroup, ListRow, Progress, Segmented } from '../ds';
import { db } from '../lib/api';
import { hasOwed, owedCrc, type CardStatus, type Owed } from '../lib/cards';
import { fromInputDateTime, moneyRaw, parseAmount, toInputDateTime } from '../lib/format';
import { addPeriod, cancelRecurring, dueDay, freqLabel, shortDay, skipRecurring, snoozeRecurring, undoPayRecurring, useRecurring } from '../lib/recurring';
import { canSendMoney } from '../lib/transfers';
import type { Account, Currency, Recurring, Tx } from '../lib/types';
import { useApp } from '../store';
import { useNetWorth } from '../screens/Patrimonio';
import { Icon, Sheet } from '.';

/** "¢30.000 + $20,00": each currency that has something, or "¢0". */
export function owedText(o: Owed) {
  const parts = [Math.abs(o.CRC) >= 1 ? moneyRaw(o.CRC, 'CRC') : '', Math.abs(o.USD) >= 0.01 ? moneyRaw(o.USD, 'USD') : ''].filter(Boolean);
  return parts.length ? parts.join(' + ') : moneyRaw(0, 'CRC');
}

const tomorrow = () => new Date(Date.now() - 6 * 3600000 + 86400000).toISOString().slice(0, 10);
const fmt = (v: number) => {
  const [i, d] = (Math.round(v * 100) / 100).toFixed(2).split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d !== '00' ? `,${d}` : '');
};

/**
 * Paying a credit card (TAR-03, TAR-04): from which account, in which currency, how much and when. What's paid is
 * subtracted from what the card owes in that currency. Shortcuts: what was charged since the last payment (an early
 * payment), what's left of the statement (pago de contado) and everything owed. With `r` (an early payment
 * recurring) it also offers postponing, ignoring and stopping it, like any recurring payment.
 */
export function CardPaySheet({ cardId, r, onClose, onPaid }: { cardId: string; r?: Recurring; onClose: () => void; onPaid?: (txId: string | null) => void }) {
  const { accounts, fx, userId, toast, bump } = useApp();
  const card = accounts.find((a) => a.id === cardId);
  const w = useNetWorth(card?.space_id || null);
  const info: CardStatus | undefined = card ? w.cardInfo[card.id] : undefined;
  const from = accounts.filter((a) => !a.archived && canSendMoney(a) && a.kind !== 'credit_card' && a.space_id === card?.space_id);
  const pick = (c: Currency) => (r?.account_id && from.some((a) => a.id === r.account_id) ? r.account_id : (from.find((a) => a.kind === 'debit' && a.currency === c) || from.find((a) => a.kind === 'debit') || from[0])?.id || '');
  const [cur, setCur] = useState<Currency>('CRC');
  const [accountId, setAccountId] = useState(() => pick('CRC'));
  const [amt, setAmt] = useState('');
  const [touched, setTouched] = useState(false);
  const [when, setWhen] = useState(toInputDateTime(new Date().toISOString()));
  const [later, setLater] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!card) return null;

  const options = info
    ? ([
        ['since', 'Desde el último pago', info.sinceLastPayment[cur]],
        ['left', 'Pago de contado', info.cycle?.left[cur] ?? 0],
        ['all', 'Todo lo que debo', Math.max(0, info.owed[cur])],
      ] as const).filter(([, , v], i, all) => v > (cur === 'USD' ? 0.009 : 0.5) && all.findIndex((x) => Math.abs(x[2] - v) < 0.01) === i)
    : [];
  // an early payment is whatever the person decides to pay: the field starts empty and the shortcuts are only suggestions (TAR-05).
  // Paying the card otherwise starts with the first suggestion (what's left of the statement) until the person types.
  const shown = touched || r ? amt : options[0] ? fmt(options[0][2]) : amt;
  const num = parseAmount(shown);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      bump();
      w.reload();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  const pay = () => run(async () => {
    const [tx] = await db.insert<Tx>('transactions', {
      space_id: card.space_id, kind: 'transfer', amount: Math.round(num * 100) / 100, currency: cur, fx_rate: cur === 'USD' ? fx : 1,
      occurred_at: fromInputDateTime(when), merchant: r?.merchant || `Pago de ${card.name}`, account_id: accountId || null, to_account_id: card.id,
      recurring_id: r?.id ?? null, status: 'posted', source: 'manual', created_by: userId,
    });
    onPaid?.(tx?.id ?? null);
    toast(`${card.name}: pagaste ${moneyRaw(num, cur)}`, async () => {
      if (!tx?.id) return;
      if (r) await undoPayRecurring(r, tx.id);
      else await db.remove('transactions', { id: tx.id });
      bump();
    });
  });

  return (
    <Sheet title={r ? `${r.merchant} · ${card.name}` : `Pagar ${card.name}`} onClose={onClose}>
      {info && (
        <p className="page-text">
          Debés {owedText(info.owed)}
          {info.cycle && hasOwed(info.cycle.left) ? `. Pago de contado: ${owedText(info.cycle.left)} antes del ${shortDay(info.cycle.due)}` : ''}
          {r ? `. ${freqLabel(r)}, toca el ${shortDay(dueDay(r))}` : ''}.
        </p>
      )}
      <div className="field-card">
        <label className="field-row">
          <span>Desde</span>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Cuenta">
            {from.map((a) => <option key={a.id} value={a.id}>{a.name}{a.last4 ? ` ••${a.last4}` : ''}</option>)}
          </select>
        </label>
        <div className="field-row">
          <span>Saldo que pagás</span>
          <Segmented size="sm" label="Moneda del pago" value={cur} onChange={(c: Currency) => { setCur(c); setTouched(false); setAccountId(pick(c)); }} options={[{ value: 'CRC', label: 'Colones' }, { value: 'USD', label: 'Dólares' }]} />
        </div>
        <label className="field-row">
          <span>Monto ({cur})</span>
          <input inputMode="decimal" value={shown} placeholder={r ? 'Cuánto pagaste' : '0'} autoFocus={!!r} onChange={(e) => { setTouched(true); setAmt(e.target.value.replace(/[^0-9.,]/g, '')); }} aria-label="Monto pagado" />
        </label>
        <label className="field-row">
          <span>Fecha</span>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
      </div>
      {options.length > 0 && (
        <div className="chips">
          {options.map(([k, l, v]) => (
            <Chip key={k} size="sm" selected={Math.abs(num - v) < 0.01} onClick={() => { setTouched(true); setAmt(fmt(v)); }}>{l}: {moneyRaw(v, cur)}</Chip>
          ))}
        </div>
      )}
      {r && (
        <ListGroup>
          {later === null ? (
            <button type="button" className="pay-alt" onClick={() => setLater(tomorrow())} disabled={busy}><Icon name="clock" size={16} /> Posponer</button>
          ) : (
            <div className="pay-alt pay-later">
              <label className="col gap6">
                <span className="field-label">Recordarme el</span>
                <input className="input" type="date" min={tomorrow()} value={later} onChange={(e) => setLater(e.target.value)} />
              </label>
              <Button variant="secondary" size="sm" disabled={busy || !later} onClick={() => later && run(async () => { await snoozeRecurring(r, later); toast(`Pospuesto para el ${shortDay(later)}`); })}>Posponer</Button>
            </div>
          )}
          <button type="button" className="pay-alt" disabled={busy} onClick={() => run(async () => { await skipRecurring(r); toast(`Ignorado · próximo ${shortDay(addPeriod(r.next_due, r.frequency, r.every_n, r.every_unit))}`); })}>
            <Icon name="arrowRight" size={16} /> Ignorar este pago
          </button>
          <button type="button" className="pay-alt danger" disabled={busy} onClick={() => confirm('¿Dejar de hacer pagos anticipados de esta tarjeta? Lo podés volver a programar en Editar.') && run(async () => { await cancelRecurring(r); toast('Pagos anticipados pausados'); })}>
            <Icon name="close" size={16} /> Dejar de repetir
          </button>
        </ListGroup>
      )}
      <ActionBar>
        <Button variant="primary" size="lg" block disabled={busy || !(num > 0) || !accountId} onClick={pay}>Registrar pago</Button>
      </ActionBar>
    </Sheet>
  );
}

/** The card's cycle in its own view: what the statement said, what's left of it and until when, the limit, early payments. */
export function CardCycle({ card, info }: { card: Account; info?: CardStatus }) {
  const { fx } = useApp();
  const { items } = useRecurring(card.space_id);
  const early = items.find((x) => x.purpose === 'card_early' && x.to_account_id === card.id && x.active);
  const c = info?.cycle;
  const edit = `#/cuenta/${card.id}/editar`;
  // the limit, in its own currency
  const limit = card.credit_limit ? Number(card.credit_limit) : null;
  // the bank holds the whole installment purchase against the limit, not just the parts already charged
  const usedCrc = info ? Math.max(0, owedCrc(info.owed, fx) + owedCrc(info.pendingInstallments, fx)) : 0;
  const used = card.currency === 'USD' ? usedCrc / fx : usedCrc;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <ListGroup title={c ? 'Este ciclo' : 'Tarjeta'}>
      {c ? (
        <>
          <ListRow
            title="Pago de contado"
            detail={hasOwed(c.left) ? (c.daysToDue < 0 ? `Venció el ${shortDay(c.due)}` : c.daysToDue === 0 ? 'Vence hoy' : `Antes del ${shortDay(c.due)}`) : `Hasta el ${shortDay(c.due)}`}
            detailTone={hasOwed(c.left) ? (c.daysToDue < 0 ? 'destructive' : c.daysToDue <= 3 ? 'warning' : 'muted') : 'muted'}
            value={hasOwed(c.left) ? owedText(c.left) : 'Cubierto'}
            valueTone={hasOwed(c.left) ? 'default' : 'success'}
          />
          <ListRow title="Saldo al corte" detail={`Corte del ${shortDay(c.cut)}`} value={owedText(c.statement)} />
          <ListRow title="Pagado desde el corte" value={owedText(c.paidSince)} />
          <ListRow title="Cargos nuevos" detail={`Desde el corte · el próximo es el ${shortDay(c.nextCut)}`} value={owedText(c.chargedSince)} />
        </>
      ) : (
        <ListRow leading={<ListRow.Icon name="calendar" />} title="Agregá la fecha de corte y la de pago" detail="Así sabés cuánto pagar de contado y hasta cuándo" chevron href={edit} />
      )}
      {info && hasOwed(info.pendingInstallments) && (
        <ListRow title="Cuotas por cargar" detail="De compras a cuotas: el banco las carga una por mes" value={owedText(info.pendingInstallments)} />
      )}
      {limit !== null && (
        <ListRow
          title="Disponible"
          detail={`Límite ${moneyRaw(limit, card.currency)}`}
          value={moneyRaw(Math.max(0, limit - used), card.currency)}
          valueTone={pct >= 100 ? 'destructive' : pct >= 80 ? 'warning' : 'default'}
          below={<Progress size="sm" value={pct / 100} tone={pct >= 100 ? 'destructive' : pct >= 80 ? 'warning' : 'default'} label={`Usado: ${pct}% del límite`} />}
        />
      )}
      <ListRow
        title="Pagos anticipados"
        detail={early ? `${freqLabel(early)} · el próximo ${shortDay(dueDay(early))}` : 'Por ejemplo, pagar cada viernes lo de la semana'}
        chevron
        href={early ? `#/recurrente/${early.id}` : edit}
      />
    </ListGroup>
  );
}
