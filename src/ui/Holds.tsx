import { useState } from 'react';
import { setHold, usePendingHolds } from '../lib/holds';
import { money, relDay } from '../lib/format';
import { photoFor, photoUrl } from '../lib/photos';
import type { Tx } from '../lib/types';
import { go, useApp } from '../store';
import { Emo, Icon } from '.';

const timeFmt = new Intl.DateTimeFormat('es-CR', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Costa_Rica' });
const SHOWN = 3;

/**
 * Uber and Didi reserve the fare before the ride and BAC emails it like a purchase. These wait here
 * until someone says whether they were charged; untouched ones settle on their own after 48 h.
 * They don't count in totals or budgets while pending. Renders nothing when there are none.
 */
export function Holds({ variant = 'sheet' }: { variant?: 'sheet' | 'card' }) {
  const { space, toast, bump } = useApp();
  const rows = usePendingHolds(space?.id);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!rows.length) return null;

  async function resolve(ts: Tx[], hold: 'void' | null) {
    setBusy(true);
    const ids = ts.map((t) => t.id);
    try {
      await setHold(ids, hold);
      const one = ts.length === 1 ? ts[0].merchant || 'Movimiento' : `${ts.length} movimientos`;
      toast(hold === 'void' ? `${one}: no se cobró` : `${one}: confirmado`, async () => {
        await setHold(ids, 'pending');
        bump();
      });
      bump();
    } catch {
      toast('No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  const list = all ? rows : rows.slice(0, SHOWN);
  return (
    <section className={variant === 'card' ? 'pp pp-card' : 'pp'} aria-label="Por confirmar">
      <div className="pp-head">
        <span>Por confirmar</span>
        <span className="pp-count">{rows.length}</span>
      </div>
      <p className="hold-hint">Uber y Didi reservan el monto antes del viaje. No cuentan hasta que confirmés si se cobró, o solos a las 48 h.</p>
      <div className="pp-list">
        {list.map((t) => (
          <HoldRow key={t.id} t={t} busy={busy} onResolve={(h) => resolve([t], h)} />
        ))}
        {(rows.length > SHOWN || rows.length > 1) && (
          <div className="hold-foot">
            {rows.length > SHOWN ? (
              <button className="pp-undo" onClick={() => setAll((v) => !v)}>{all ? 'Ver menos' : `Ver ${rows.length - SHOWN} más`}</button>
            ) : <span />}
            <button className="hold-all" disabled={busy} onClick={() => resolve(rows, null)}>
              <Icon name="check" size={15} stroke={2.6} />
              Todos se cobraron
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function HoldRow({ t, busy, onResolve }: { t: Tx; busy: boolean; onResolve: (hold: 'void' | null) => void }) {
  const { categories, photos, cur, fx } = useApp();
  const cat = categories.find((c) => c.id === t.category_id);
  const photo = photoFor(photos, t.merchant, t.raw_merchant);
  const name = t.merchant || 'Movimiento';
  return (
    <div className="pp-row hold-row">
      <button className="pp-main" onClick={() => go(`/mov/${t.id}`)}>
        <Emo e={cat?.emoji || '🚗'} color={cat?.color || 'gray'} img={photo ? photoUrl(photo) : null} size={40} />
        <span className="pp-mid">
          <span className="pp-name">{name}</span>
          <span className="pp-sub">{relDay(t.occurred_at)} · {timeFmt.format(new Date(t.occurred_at))}</span>
        </span>
        <span className="pp-amt">{money(Number(t.amount_crc), cur, fx)}</span>
      </button>
      <button className="pp-pay hold-no" onClick={() => onResolve('void')} disabled={busy} aria-label={`${name}: no se cobró`} title="No se cobró">
        <Icon name="close" size={16} stroke={2.6} />
      </button>
      <button className="pp-pay" onClick={() => onResolve(null)} disabled={busy} aria-label={`${name}: se cobró`} title="Se cobró">
        <Icon name="check" size={18} stroke={2.6} />
      </button>
    </div>
  );
}
