import { useEffect, useState } from 'react';
import { db } from './api';
import type { Tx } from './types';
import { TX_SELECT, useApp } from '../store';

export type Hold = 'pending' | 'void' | null;

/** Uber and Didi reserve money before the ride. Someone says whether it was charged (null) or not ('void'). */
export async function setHold(ids: string[], hold: Hold) {
  if (!ids.length) return;
  await db.updateIds('transactions', ids, { hold, hold_resolved_at: hold === 'pending' ? null : new Date().toISOString() });
}

/** Authorizations still waiting for an answer in this space, newest first. */
export function usePendingHolds(spaceId?: string | null) {
  const { version } = useApp();
  const [rows, setRows] = useState<Tx[]>([]);
  useEffect(() => {
    if (!spaceId) return;
    let alive = true;
    db.from<Tx>('transactions', TX_SELECT).eq('space_id', spaceId).eq('hold', 'pending').order('occurred_at', false).limit(60)
      .then((r) => alive && setRows(r))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [spaceId, version]);
  return rows;
}

/** When a pending authorization settles on its own (48 h after the voucher). */
export function settlesIn(t: Tx) {
  const h = Math.max(0, Math.ceil((new Date(t.occurred_at).getTime() + 48 * 3600000 - Date.now()) / 3600000));
  return h <= 1 ? 'se confirma en menos de 1 h' : `se confirma sola en ${h} h`;
}
