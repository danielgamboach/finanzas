import { crIso, crLocal, todayCR } from './format';
import type { Account, Category, Tx } from './types';
import { familyIds } from './cats';

export interface Range { from: string; to: string }

export function monthRange(y: number, m: number): Range {
  return { from: crIso(y, m, 1), to: crIso(y, m + 1, 1) };
}

/** Week that contains `ref` (CR time), starting on weekStart (0=Sunday … 5=Friday). */
export function weekRange(weekStart: number, offsetWeeks = 0, ref = todayCR()): Range & { startKey: string } {
  const back = (ref.dow - weekStart + 7) % 7;
  const from = crIso(ref.y, ref.m, ref.d - back + offsetWeeks * 7);
  const to = crIso(ref.y, ref.m, ref.d - back + offsetWeeks * 7 + 7);
  const l = crLocal(from);
  const startKey = `${l.getUTCFullYear()}-${String(l.getUTCMonth() + 1).padStart(2, '0')}-${String(l.getUTCDate()).padStart(2, '0')}`;
  return { from, to, startKey };
}

/** Monthly budget = sum of category limits (weekly limits count ~4.33 times). */
export function monthBudget(cats: Category[]) {
  return cats.reduce((a, c) => a + (c.kind === 'expense' && !c.archived && !c.parent_id && c.limit_amount ? (c.limit_period === 'weekly' ? Number(c.limit_amount) * 4.33 : Number(c.limit_amount)) : 0), 0);
}

export const inRange = (t: Tx, r: Range) => t.occurred_at >= r.from && t.occurred_at < r.to;

/** Positive = money spent, negative = money returned. */
export function spend(t: Tx) {
  if (t.hold) return 0; // authorizations count once they're charged
  if (t.kind === 'expense') return Number(t.amount_crc);
  if (t.kind === 'refund') return -Number(t.amount_crc);
  return 0;
}

export function sumSpend(txs: Tx[]) {
  return txs.reduce((a, t) => a + spend(t), 0);
}

export function sumKind(txs: Tx[], kind: Tx['kind']) {
  return txs.filter((t) => t.kind === kind && !t.hold).reduce((a, t) => a + Number(t.amount_crc), 0);
}

export type Level = 'ok' | 'warn' | 'over' | 'none';

export function level(pct: number | null): Level {
  if (pct === null) return 'none';
  if (pct >= 100) return 'over';
  if (pct >= 80) return 'warn';
  return 'ok';
}

export interface CatStat {
  cat: Category;
  spent: number; // in the category's own period
  monthSpent: number;
  limit: number | null;
  pct: number | null;
  level: Level;
  projection: number | null;
  periodLabel: string;
  /** Month spend per subcategory, plus the part left on the parent itself (cat = parent). */
  subs: { cat: Category; monthSpent: number; spent: number; direct?: boolean }[];
}

export function categoryStats(cats: Category[], txs: Tx[], month: Range, week: Range, isCurrentMonth: boolean): CatStat[] {
  const t = todayCR();
  const l = crLocal(month.from);
  const daysInMonth = new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth() + 1, 0)).getUTCDate();
  return cats
    .filter((c) => c.kind === 'expense' && !c.archived && !c.parent_id)
    .map((cat) => {
      const fam = familyIds(cats, cat.id);
      const ofCat = txs.filter((x) => x.category_id && fam.has(x.category_id));
      const monthSpent = sumSpend(ofCat.filter((x) => inRange(x, month)));
      const weekly = cat.limit_period === 'weekly';
      const spent = weekly && isCurrentMonth ? sumSpend(ofCat.filter((x) => inRange(x, week))) : monthSpent;
      const limit = cat.limit_amount == null ? null : weekly && !isCurrentMonth ? Number(cat.limit_amount) * (daysInMonth / 7) : Number(cat.limit_amount);
      const pct = limit ? Math.round((spent / limit) * 100) : null;
      let projection: number | null = null;
      if (isCurrentMonth && !weekly && !cat.is_fixed && monthSpent > 0) {
        projection = Math.round((monthSpent / Math.max(t.d, 1)) * daysInMonth);
      }
      const kids = cats.filter((c) => c.parent_id === cat.id && !c.archived);
      const inPeriod = (x: Tx) => (weekly && isCurrentMonth ? inRange(x, week) : inRange(x, month));
      const subs = kids.length
        ? [
            ...kids.map((k) => {
              const of = ofCat.filter((x) => x.category_id === k.id);
              return { cat: k, monthSpent: sumSpend(of.filter((x) => inRange(x, month))), spent: sumSpend(of.filter(inPeriod)) };
            }),
            (() => {
              const of = ofCat.filter((x) => x.category_id === cat.id);
              return { cat, monthSpent: sumSpend(of.filter((x) => inRange(x, month))), spent: sumSpend(of.filter(inPeriod)), direct: true };
            })(),
          ].sort((a, b) => b.spent - a.spent)
        : [];
      return {
        cat,
        subs,
        spent,
        monthSpent,
        limit,
        pct,
        level: cat.is_fixed && pct !== null && pct >= 100 ? 'ok' : level(pct),
        projection,
        periodLabel: cat.is_fixed ? 'Fijo' : weekly ? (isCurrentMonth ? 'Esta semana' : 'Semanal') : 'Mensual',
      } as CatStat;
    })
    .sort((a, b) => a.cat.sort - b.cat.sort);
}

/**
 * Since when a credit card is unpaid. Paying a card brings it back to zero, whatever the amount:
 * - the weekly "Pago de tarjeta" of a shared space (external_id `card-week:<start>`) covers that whole week
 *   on every card of the space, so it's paid through the end of that week;
 * - any other payment to the card (a transfer to it) covers everything up to the payment.
 * With no payment recorded yet, only the current month counts.
 */
export function cardPaidThrough(card: Account, txs: Tx[], spaceCards: Set<string>) {
  const t = todayCR();
  let through = crIso(t.y, t.m, 1);
  for (const x of txs) {
    if (x.kind !== 'transfer' || !x.to_account_id || !spaceCards.has(x.to_account_id)) continue;
    const week = x.external_id?.match(/^card-week:(\d{4})-(\d{2})-(\d{2})$/);
    let end: string | null = null;
    if (week) end = crIso(Number(week[1]), Number(week[2]) - 1, Number(week[3]) + 7);
    else if (x.to_account_id === card.id) end = x.occurred_at;
    if (end && end > through) through = end;
  }
  return through;
}

/** Money owed on a credit card: what was charged to it since it was last paid. */
export function cardOutstanding(card: Account, txs: Tx[], spaceCards: Set<string> = new Set([card.id])) {
  const since = cardPaidThrough(card, txs, spaceCards);
  return Math.max(0, txs.filter((t) => t.account_id === card.id && t.occurred_at >= since).reduce((a, t) => a + spend(t), 0));
}

export function tagsOf(t: Tx): string[] {
  return (t.transaction_tags || []).map((x) => x.tags?.name).filter(Boolean) as string[];
}

export function extractTags(note: string) {
  return Array.from(new Set((note.match(/#[\p{L}\p{N}_-]+/gu) || []).map((s) => s.toLowerCase())));
}

/** Cumulative spend per day of a month, from day 1 up to `upTo` days. */
export function cumulative(txs: Tx[], y: number, m: number, upTo: number) {
  const daily = new Array(Math.max(upTo, 0)).fill(0);
  for (const t of txs) {
    const l = crLocal(t.occurred_at);
    if (l.getUTCFullYear() !== y || l.getUTCMonth() !== m) continue;
    const d = l.getUTCDate() - 1;
    if (d < upTo) daily[d] += spend(t);
  }
  let acc = 0;
  return daily.map((v) => (acc += v));
}
