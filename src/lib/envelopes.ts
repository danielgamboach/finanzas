import { useEffect, useState } from 'react';
import { db } from './api';
import { spend, type Range } from './calc';
import { crIso, dateKey, todayCR } from './format';
import { addPeriod } from './recurring';
import type { Category, Currency, Recurring, Tx } from './types';
import { useApp } from '../store';

/**
 * Sobres (docs/comportamiento/presupuesto.md, SOB): what can be spent on something per week, fortnight or month.
 * Each expense falls in the envelope that holds its category (or its parent); everything else in "Todo lo demás".
 */

export type EnvPeriod = 'weekly' | 'biweekly' | 'monthly';

export interface Envelope {
  id: string;
  space_id: string;
  name: string;
  amount: number | null;
  currency: Currency;
  period: EnvPeriod;
  is_rest: boolean;
  sort: number;
}

export interface EnvLink { category_id: string; envelope_id: string }

export const PERIOD_LABEL: Record<EnvPeriod, string> = { weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual' };
export const PERIOD_NOW: Record<EnvPeriod, string> = { weekly: 'esta semana', biweekly: 'esta quincena', monthly: 'este mes' };

/** The current period of an envelope in CR time (SOB-03): ISO instants, `to` exclusive, plus YYYY-MM-DD ends and days left. */
export function envRange(period: EnvPeriod, weekStart: number, ref = todayCR()): Range & { fromDay: string; toDay: string; daysLeft: number } {
  let from: [number, number, number], to: [number, number, number];
  if (period === 'weekly') {
    const back = (ref.dow - weekStart + 7) % 7;
    from = [ref.y, ref.m, ref.d - back];
    to = [ref.y, ref.m, ref.d - back + 7];
  } else if (period === 'biweekly') {
    from = ref.d <= 15 ? [ref.y, ref.m, 1] : [ref.y, ref.m, 16];
    to = ref.d <= 15 ? [ref.y, ref.m, 16] : [ref.y, ref.m + 1, 1];
  } else {
    from = [ref.y, ref.m, 1];
    to = [ref.y, ref.m + 1, 1];
  }
  const key = (a: [number, number, number]) => {
    const d = new Date(Date.UTC(a[0], a[1], a[2]));
    return d.toISOString().slice(0, 10);
  };
  const todayKey = key([ref.y, ref.m, ref.d]);
  const toDay = key(to);
  const daysLeft = Math.round((Date.parse(toDay) - Date.parse(todayKey)) / 86400000);
  return { from: crIso(...from), to: crIso(...to), fromDay: key(from), toDay, daysLeft };
}

/** Category id → envelope id, with subcategories following their parent (SOB-01). */
export function envelopeOf(categories: Category[], links: EnvLink[], envelopes: Envelope[]) {
  const direct = new Map(links.map((l) => [l.category_id, l.envelope_id]));
  const alive = new Set(envelopes.map((e) => e.id));
  return (catId: string | null | undefined): string | null => {
    if (!catId) return null;
    const own = direct.get(catId);
    if (own && alive.has(own)) return own;
    const parent = categories.find((c) => c.id === catId)?.parent_id;
    const viaParent = parent ? direct.get(parent) : undefined;
    return viaParent && alive.has(viaParent) ? viaParent : null;
  };
}

/** Due dates of a recurrent inside [from, to) (YYYY-MM-DD). Overdue ones count too (SOB-04). */
function pendingDates(r: Recurring, toDay: string) {
  const out: string[] = [];
  let d = r.snooze_until && r.snooze_until > r.next_due ? r.snooze_until : r.next_due;
  for (let i = 0; i < 400 && d < toDay; i++) {
    out.push(d);
    const n = addPeriod(d, r.frequency, r.every_n, r.every_unit);
    if (n <= d) break;
    d = n;
  }
  return out;
}

export interface EnvCommit { r: Recurring; dates: string[]; amount: number }

export interface EnvStat {
  env: Envelope;
  range: ReturnType<typeof envRange>;
  /** In CRC. Null: "Todo lo demás" without an amount. */
  amount: number | null;
  spent: number;
  committed: number;
  /** amount − spent − committed (SOB-04). Null without an amount. */
  left: number | null;
  txs: Tx[];
  /** Recurring payments of the period: still pending ones (committed) and the ones already paid. */
  pending: EnvCommit[];
  paid: { r: Recurring; tx: Tx }[];
  cats: Category[];
}

export const toCrc = (amount: number, currency: Currency, fx: number) => (currency === 'USD' ? Number(amount) * fx : Number(amount));

/** Every envelope of the space with its current period (SOB-02 to SOB-05). "Todo lo demás" always comes last. */
export function envelopeStats(o: { envelopes: Envelope[]; links: EnvLink[]; categories: Category[]; recurring: Recurring[]; txs: Tx[]; spaceId: string; weekStart: number; fx: number }): EnvStat[] {
  const { categories, fx } = o;
  const own = o.envelopes.filter((e) => !e.is_rest).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const rest = o.envelopes.find((e) => e.is_rest) || { id: 'rest', space_id: o.spaceId, name: 'Todo lo demás', amount: null, currency: 'CRC' as Currency, period: 'monthly' as EnvPeriod, is_rest: true, sort: 1000 };
  const of = envelopeOf(categories, o.links, own);
  const envFor = (catId: string | null | undefined) => of(catId) || rest.id;
  return [...own, rest].map((env) => {
    const range = envRange(env.period, o.weekStart);
    const txs = o.txs.filter((x) => x.space_id === o.spaceId && x.occurred_at >= range.from && x.occurred_at < range.to && spend(x) !== 0 && envFor(x.category_id) === env.id);
    const spent = txs.reduce((a, x) => a + spend(x), 0);
    const recs = o.recurring.filter((r) => r.kind === 'expense' && envFor(r.category_id) === env.id);
    const pending = recs.filter((r) => r.active).map((r) => {
      const dates = pendingDates(r, range.toDay);
      return { r, dates, amount: dates.length * toCrc(r.amount, r.currency, fx) };
    }).filter((c) => c.dates.length > 0);
    const paid = recs.flatMap((r) => txs.filter((x) => x.recurring_id === r.id).map((tx) => ({ r, tx })));
    const committed = pending.reduce((a, c) => a + c.amount, 0);
    const amount = env.amount != null ? toCrc(env.amount, env.currency, fx) : null;
    const ids = new Set(o.links.filter((l) => l.envelope_id === env.id).map((l) => l.category_id));
    return {
      env, range, amount, spent, committed,
      left: amount != null ? amount - spent - committed : null,
      txs, pending, paid,
      cats: categories.filter((c) => ids.has(c.id)).sort((a, b) => a.sort - b.sort),
    };
  });
}

/** "Para gastar" (SOB-07): what's left in the current period of every envelope with an amount. Null when there are none. */
export function toSpend(stats: EnvStat[]) {
  const withAmount = stats.filter((s) => s.left != null);
  if (!withAmount.length) return null;
  return { left: withAmount.reduce((a, s) => a + s.left!, 0), total: withAmount.reduce((a, s) => a + s.amount!, 0), count: withAmount.length };
}

/** Widest range that covers every envelope's current period (to load the movements once). */
export function envelopesSpan(weekStart: number): Range {
  const ps: EnvPeriod[] = ['weekly', 'biweekly', 'monthly'];
  const rs = ps.map((p) => envRange(p, weekStart));
  return { from: rs.map((r) => r.from).sort()[0], to: rs.map((r) => r.to).sort().at(-1)! };
}

/** Envelopes, their categories and the space's recurrents. */
export function useEnvelopes(spaceId: string | null | undefined) {
  const { version } = useApp();
  const [d, setD] = useState<{ envelopes: Envelope[]; links: EnvLink[]; recurring: Recurring[] } | null>(null);
  useEffect(() => {
    if (!spaceId) return;
    let alive = true;
    const safe = <T,>(p: PromiseLike<T[]>) => Promise.resolve(p).catch(() => [] as T[]);
    Promise.all([
      safe(db.from<Envelope>('envelopes').eq('space_id', spaceId).order('sort')),
      safe(db.from<EnvLink>('envelope_categories', 'category_id,envelope_id,envelopes!inner(space_id)').eq('envelopes.space_id', spaceId)),
      safe(db.from<Recurring>('recurring').eq('space_id', spaceId)),
    ]).then(([envelopes, links, recurring]) => {
      if (alive) setD({ envelopes, links: links.map((l) => ({ category_id: l.category_id, envelope_id: l.envelope_id })), recurring });
    });
    return () => {
      alive = false;
    };
  }, [spaceId, version]);
  return d;
}

/** Sum of an envelope's recurrents due in its current period, paid or not (SOB-06). */
export function recurringSuggestion(s: EnvStat, fx: number) {
  return s.pending.reduce((a, c) => a + c.amount, 0) + s.paid.reduce((a, p) => a + Number(p.tx.amount_crc), 0) || 0;
}

export const shortDayKey = (iso: string) => dateKey(iso);
