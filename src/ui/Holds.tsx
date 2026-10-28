import { useState } from 'react';
import { Button, ListGroup, ListRow } from '../ds';
import { setHold, usePendingHolds } from '../lib/holds';
import { amount, relDay, unitOf } from '../lib/format';
import { txPhoto } from '../lib/merchants';
import type { Tx } from '../lib/types';
import { go, useApp } from '../store';
import { Emo } from '.';

const timeFmt = new Intl.DateTimeFormat('es-CR', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Costa_Rica' });
const SHOWN = 3;

/**
 * Uber and Didi reserve the fare before the ride and BAC emails it like a purchase. Only bursts (two or
 * more rides on the same card less than 10 minutes apart) wait here, since one of them was usually never
 * charged; a lone ride counts right away. Untouched ones settle on their own after 48 h.
 * They don't count in totals or budgets while pending. Renders nothing when there are none.
 */
export function Holds(_: { variant?: 'sheet' | 'card' }) {
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
      toast(hold === 'void' ? `${one}: eliminado, no se cobró` : `${one}: confirmado`, async () => {
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
  const footer = rows.length > 1 ? (
    <>
      {rows.length > SHOWN ? (
        <Button variant="ghost" size="xs" onClick={() => setAll((v) => !v)}>{all ? 'Ver menos' : `Ver ${rows.length - SHOWN} más`}</Button>
      ) : <span />}
      <Button variant="secondary" size="xs" disabled={busy} onClick={() => resolve(rows, null)}>Todos se cobraron</Button>
    </>
  ) : undefined;
  return (
    <ListGroup title="Por confirmar" count={rows.length} note="Viajes seguidos en la misma tarjeta: alguno pudo no cobrarse. Los que no toqués se confirman solos a las 48 h." footer={footer}>
      {list.map((t) => (
        <HoldRow key={t.id} t={t} busy={busy} onResolve={(h) => resolve([t], h)} />
      ))}
    </ListGroup>
  );
}

function HoldRow({ t, busy, onResolve }: { t: Tx; busy: boolean; onResolve: (hold: 'void' | null) => void }) {
  const { categories, merchants, cur, fx } = useApp();
  const cat = categories.find((c) => c.id === t.category_id);
  const photo = txPhoto(merchants, t);
  const name = t.merchant || 'Movimiento';
  return (
    <ListRow
      leading={<Emo e={cat?.emoji || '🚗'} color={cat?.color || 'gray'} img={photo} size={40} />}
      title={name}
      detail={`${relDay(t.occurred_at)} · ${timeFmt.format(new Date(t.occurred_at))} · ${amount(Number(t.amount_crc), cur, fx)} ${unitOf(cur)}`}
      onClick={() => go(`/mov/${t.id}`)}
      actions={
        <>
          <Button variant="secondary" size="xs" onClick={() => onResolve('void')} disabled={busy} aria-label={`${name}: no se cobró`} title="No se cobró">No</Button>
          <Button variant="primary" size="xs" onClick={() => onResolve(null)} disabled={busy} aria-label={`${name}: sí se cobró`} title="Se cobró">Sí</Button>
        </>
      }
    />
  );
}
