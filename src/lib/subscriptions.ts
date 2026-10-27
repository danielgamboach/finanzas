import { useEffect, useState } from 'react';
import { db } from './api';
import type { Frequency, Tx } from './types';
import { TX_SELECT, useApp } from '../store';

/** Same grouping the database uses to remember the answer: catalog merchant, else its key, else its name. */
export const subKey = (t: Tx) => (t.merchant_id ? `m:${t.merchant_id}` : t.merchant_key ? `k:${t.merchant_key}` : `n:${(t.merchant || '').toUpperCase()}`);

/**
 * Digital charges waiting for "¿Es una suscripción?", one per merchant (its latest charge), newest first.
 * The database flags them: known services on arrival, the rest when the AI says they look like a plan.
 */
export function usePendingSubs(spaceId?: string | null) {
  const { version } = useApp();
  const [rows, setRows] = useState<Tx[]>([]);
  useEffect(() => {
    if (!spaceId) return;
    let alive = true;
    db.from<Tx>('transactions', TX_SELECT).eq('space_id', spaceId).eq('sub_ask', 'pending').order('occurred_at', false).limit(60)
      .then((r) => {
        if (!alive) return;
        const seen = new Set<string>();
        setRows(r.filter((t) => !seen.has(subKey(t)) && !!seen.add(subKey(t))));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [spaceId, version]);
  return rows;
}

/** Yes (with how often) adds it to Recurrentes and links this charge; no is remembered for the merchant. */
export async function answerSub(t: Tx, isSub: boolean, frequency?: Frequency) {
  await db.rpc('answer_subscription', { p_tx: t.id, p_is_sub: isSub, p_frequency: frequency ?? null });
}

/** Back to asking: forgets the answer and removes the recurring payment it created. */
export async function undoSub(t: Tx) {
  const rid = await db.rpc<string | null>('undo_subscription_answer', { p_tx: t.id });
  if (rid) await db.remove('recurring', { id: rid });
}
