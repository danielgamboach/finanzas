import { db } from './api';
import { restoreCategories } from './undo';
import type { Tx } from './types';

type Snap = Pick<Tx, 'id' | 'category_id' | 'status' | 'category_source' | 'suggested_category_id'>;
type Result = { total: number; transactions: Snap[]; rules: { id: string; category_id: string }[] };

const sideOf = (kind: string) => (kind === 'income' ? 'income' : kind === 'expense' || kind === 'refund' ? 'expense' : null);

/**
 * The other movements of this merchant in its space, on the same side of the ledger:
 * every branch when it is in the catalog, otherwise the same bank key or name.
 */
export async function merchantSiblings(t: Tx): Promise<Pick<Tx, 'id' | 'kind' | 'category_id'>[]> {
  const side = sideOf(t.kind);
  if (!side) return [];
  const q = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  const conds = (t.merchant_id ? [`merchant_id.eq.${t.merchant_id}`] : [t.merchant_key && `merchant_key.eq.${q(t.merchant_key)}`, t.merchant && `merchant.eq.${q(t.merchant)}`]).filter(Boolean) as string[];
  if (!conds.length) return [];
  const rows = await db.from<Tx>('transactions', 'id,kind,category_id,merchant_id').eq('space_id', t.space_id).or(...conds).limit(2000);
  return rows.filter((r) => r.id !== t.id && sideOf(r.kind) === side && (t.merchant_id || !r.merchant_id));
}

/**
 * Moves the whole merchant to a category: all its movements in the space, and the explicit rules that only
 * catch it, so new vouchers land there too. Returns how many it touched and a way to put everything back.
 */
export async function setMerchantCategory(txId: string, categoryId: string) {
  const r = await db.rpc<Result>('set_merchant_category', { p_tx: txId, p_category: categoryId });
  const undo = async () => {
    if (r.transactions.length) await restoreCategories(r.transactions);
    for (const rule of r.rules) await db.updateIds('merchant_rules', [rule.id], { category_id: rule.category_id });
  };
  return { total: r.total, changed: r.transactions.length, undo };
}
