import { useEffect, useState } from 'react';
import { db } from './api';
import { monthRange, spend } from './calc';
import { familyIds } from './cats';
import { crLocal, todayCR } from './format';
import { addPeriod } from './recurring';
import type { Category, Currency, Recurring, Tx } from './types';
import { useApp } from '../store';

/**
 * Presupuesto as a list of budget lines (docs/comportamiento/presupuesto.md, PPT), like a spreadsheet:
 * each line is a fixed payment, a cap on what can be spent, or money to set apart, all monthly.
 * Lines live in the `envelopes` table (`kind`); caps keep their categories in `envelope_categories`.
 */

export type LineKind = 'fixed' | 'cap' | 'saving';

export interface Line {
  id: string;
  space_id: string;
  name: string;
  amount: number | null;
  currency: Currency;
  kind: LineKind;
  recurring_id: string | null;
  group_category_id: string | null;
  account_id: string | null;
  active: boolean;
  is_rest: boolean;
  sort: number;
}

export interface LineLink { category_id: string; envelope_id: string }
export interface Settings { space_id: string; income: number | null; currency: Currency }

export const KIND_LABEL: Record<LineKind, string> = { fixed: 'Pago fijo', cap: 'Tope', saving: 'Ahorro' };
export const GROUP_LABEL: Record<LineKind, string> = { fixed: 'Pagos fijos', cap: 'Gastos con tope', saving: 'Ahorro' };

export const toCrc = (amount: number, currency: Currency, fx: number) => (currency === 'USD' ? Number(amount) * fx : Number(amount));

/** "2026-11-01" for the current month in CR. */
export function monthKeyNow() {
  const t = todayCR();
  return `${t.y}-${String(t.m + 1).padStart(2, '0')}-01`;
}

const dayKey = (iso: string) => crLocal(iso).toISOString().slice(0, 10);

export interface RecState { r: Recurring; paidOn: string | null; paid: number; dueOn: string | null }

export interface LineStat {
  line: Line;
  /** In CRC. */
  amount: number;
  /** Paid (fixed), spent (cap) or set apart (saving) this month. */
  actual: number;
  /** Fixed: every payment of the month made. Saving: set apart. Never for a cap. */
  done: boolean;
  /** Cap: amount − spent. */
  left: number | null;
  /** Fixed: its recurrents this month. */
  recs: RecState[];
  /** Cap: its categories and this month's movements. */
  cats: Category[];
  txs: Tx[];
  marked: boolean;
}

export interface Budget {
  lines: LineStat[];
  byKind: Record<LineKind, LineStat[]>;
  total: Record<LineKind, number>;
  budgeted: number;
  income: number | null;
  /** income − budgeted (PPT-05). */
  free: number | null;
  /** What's left in the caps (PPT-06). Null without caps. */
  toSpend: { left: number; total: number; count: number } | null;
}

/** This month's state of one recurrent: paid (and when) or due (and when). */
function recState(r: Recurring, monthTxs: Tx[], from: string, to: string): RecState | null {
  const paidTxs = monthTxs.filter((x) => x.recurring_id === r.id);
  const paid = paidTxs.reduce((a, x) => a + spend(x), 0);
  const paidOn = paidTxs.length ? dayKey(paidTxs.map((x) => x.occurred_at).sort().at(-1)!) : r.last_paid_on && r.last_paid_on >= from && r.last_paid_on < to ? r.last_paid_on : null;
  let dueOn: string | null = null;
  if (r.active) {
    let d = r.next_due;
    for (let i = 0; i < 60 && d < to; i++) {
      if (d >= from || !paidOn) { dueOn = d; break; } // an overdue payment from before the month still counts
      const n = addPeriod(d, r.frequency, r.every_n, r.every_unit);
      if (n <= d) break;
      d = n;
    }
  }
  if (!paidOn && !dueOn) return null; // nothing this month (an annual one, say)
  return { r, paidOn, paid, dueOn };
}

export function buildBudget(o: { lines: Line[]; links: LineLink[]; recurring: Recurring[]; settings: Settings | null; marks: { envelope_id: string; month: string }[]; categories: Category[]; txs: Tx[]; spaceId: string; fx: number }): Budget {
  const { categories, fx } = o;
  const t = todayCR();
  const range = monthRange(t.y, t.m);
  const from = dayKey(range.from), to = dayKey(range.to);
  const mKey = monthKeyNow();
  const monthTxs = o.txs.filter((x) => x.space_id === o.spaceId && x.occurred_at >= range.from && x.occurred_at < range.to && x.hold !== 'void');

  const lines = o.lines.filter((l) => l.active && !l.is_rest && l.amount != null).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)).map((line): LineStat => {
    const amount = toCrc(line.amount!, line.currency, fx);
    const marked = o.marks.some((m) => m.envelope_id === line.id && m.month === mKey);
    const base = { line, amount, recs: [] as RecState[], cats: [] as Category[], txs: [] as Tx[], marked, left: null as number | null };
    if (line.kind === 'fixed') {
      const fam = line.group_category_id ? familyIds(categories, line.group_category_id) : null;
      const rs = line.recurring_id
        ? o.recurring.filter((r) => r.id === line.recurring_id)
        : fam ? o.recurring.filter((r) => r.kind === 'expense' && r.category_id && fam.has(r.category_id)) : [];
      const recs = rs.map((r) => recState(r, monthTxs, from, to)).filter(Boolean) as RecState[];
      const actual = recs.reduce((a, s) => a + s.paid, 0);
      return { ...base, recs, actual, done: recs.length > 0 && recs.every((s) => s.paidOn && !s.dueOn) };
    }
    if (line.kind === 'cap') {
      const ids = new Set<string>();
      o.links.filter((l) => l.envelope_id === line.id).forEach((l) => familyIds(categories, l.category_id).forEach((c) => ids.add(c)));
      const txs = monthTxs.filter((x) => x.category_id && ids.has(x.category_id) && spend(x) !== 0);
      const actual = txs.reduce((a, x) => a + spend(x), 0);
      const cats = categories.filter((c) => o.links.some((l) => l.envelope_id === line.id && l.category_id === c.id));
      return { ...base, cats, txs, actual, left: amount - actual, done: false };
    }
    // saving: money that came into its account this month, or "Aparté"
    const moved = line.account_id
      ? monthTxs.filter((x) => !x.hold && ((x.kind === 'transfer' && x.to_account_id === line.account_id && x.account_id !== line.account_id) || (x.kind === 'income' && x.account_id === line.account_id)))
          .reduce((a, x) => a + Number(x.amount_crc), 0)
      : 0;
    const actual = marked ? Math.max(amount, moved) : moved;
    return { ...base, actual, done: actual >= amount - 0.5 };
  });

  const byKind = { fixed: lines.filter((l) => l.line.kind === 'fixed'), cap: lines.filter((l) => l.line.kind === 'cap'), saving: lines.filter((l) => l.line.kind === 'saving') };
  const sum = (ls: LineStat[]) => ls.reduce((a, l) => a + l.amount, 0);
  const total = { fixed: sum(byKind.fixed), cap: sum(byKind.cap), saving: sum(byKind.saving) };
  const budgeted = total.fixed + total.cap + total.saving;
  const income = o.settings?.income != null ? toCrc(o.settings.income, o.settings.currency, fx) : null;
  const caps = byKind.cap;
  return {
    lines, byKind, total, budgeted, income,
    free: income != null ? income - budgeted : null,
    toSpend: caps.length ? { left: caps.reduce((a, l) => a + l.left!, 0), total: total.cap, count: caps.length } : null,
  };
}

/** Lines, cap categories, recurrents, salary and this month's "Aparté" marks of a space. */
export function useBudgetData(spaceId: string | null | undefined) {
  const { version } = useApp();
  const [d, setD] = useState<{ lines: Line[]; links: LineLink[]; recurring: Recurring[]; settings: Settings | null; marks: { envelope_id: string; month: string }[] } | null>(null);
  useEffect(() => {
    if (!spaceId) return;
    let alive = true;
    const safe = <T,>(p: PromiseLike<T[]>) => Promise.resolve(p).catch(() => [] as T[]);
    Promise.all([
      safe(db.from<Line>('envelopes').eq('space_id', spaceId).order('sort')),
      safe(db.from<LineLink & { envelopes?: unknown }>('envelope_categories', 'category_id,envelope_id,envelopes!inner(space_id)').eq('envelopes.space_id', spaceId)),
      safe(db.from<Recurring>('recurring').eq('space_id', spaceId)),
      safe(db.from<Settings>('budget_settings').eq('space_id', spaceId)),
      safe(db.from<{ envelope_id: string; month: string }>('envelope_marks', 'envelope_id,month,envelopes!inner(space_id)').eq('envelopes.space_id', spaceId).eq('month', monthKeyNow())),
    ]).then(([lines, links, recurring, settings, marks]) => {
      if (alive) setD({ lines, links: links.map((l) => ({ category_id: l.category_id, envelope_id: l.envelope_id })), recurring, settings: settings[0] || null, marks: marks.map((m) => ({ envelope_id: m.envelope_id, month: m.month })) });
    });
    return () => {
      alive = false;
    };
  }, [spaceId, version]);
  return d;
}

/** Next date with this day of the month, today included (clamped to the month's length). */
export function nextDueForDay(day: number) {
  const t = todayCR();
  const make = (y: number, m: number) => {
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const d = new Date(Date.UTC(y, m, Math.min(day, last)));
    return d.toISOString().slice(0, 10);
  };
  const thisMonth = make(t.y, t.m);
  const today = `${t.y}-${String(t.m + 1).padStart(2, '0')}-${String(t.d).padStart(2, '0')}`;
  return thisMonth >= today ? thisMonth : make(t.y, t.m + 1);
}
