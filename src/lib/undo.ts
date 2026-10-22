import { db } from './api';
import type { Tx } from './types';

type Snap = Pick<Tx, 'id' | 'category_id' | 'status' | 'category_source' | 'suggested_category_id'>;

/** What a category change will overwrite, so it can be put back. */
export function snapCategories(txs: Tx[]): Snap[] {
  return txs.map((t) => ({ id: t.id, category_id: t.category_id, status: t.status, category_source: t.category_source ?? null, suggested_category_id: t.suggested_category_id ?? null }));
}

/** Puts the snapshot back; rows that were alike go in one request. */
export async function restoreCategories(snap: Snap[]) {
  const groups = new Map<string, { patch: Omit<Snap, 'id'>; ids: string[] }>();
  for (const { id, ...patch } of snap) {
    const k = JSON.stringify(patch);
    const g = groups.get(k) || { patch, ids: [] };
    g.ids.push(id);
    groups.set(k, g);
  }
  for (const g of groups.values()) await db.updateIds('transactions', g.ids, g.patch);
}
