import { useEffect, useState } from 'react';
import { db } from './api';
import { monthRange, spend } from './calc';
import { familyIds, rootId } from './cats';
import { crLocal, todayCR } from './format';
import { addPeriod } from './recurring';
import type { Account, Category, Currency, Recurring, Tx } from './types';
import { useApp } from '../store';

/**
 * Presupuesto as the month written ahead of time (docs/comportamiento/presupuesto.md, PRM):
 * the month's real movements plus the planned ones, grouped by category.
 * - Planned payments are the recurrents still due this month (they become real when paid).
 * - A "planeado abierto" (open plan) is an amount for a category that real spending eats up.
 *   It lives in `envelopes` (kind 'cap', one category in `envelope_categories`) and repeats every month.
 */

export interface Line {
  id: string;
  space_id: string;
  name: string;
  amount: number | null;
  currency: Currency;
  kind: 'fixed' | 'cap' | 'saving';
  recurring_id: string | null;
  group_category_id: string | null;
  account_id: string | null;
  active: boolean;
  amount_auto?: boolean;
  is_rest: boolean;
  sort: number;
}

export interface LineLink { category_id: string; envelope_id: string }

export const toCrc = (amount: number, currency: Currency, fx: number) => (currency === 'USD' ? Number(amount) * fx : Number(amount));

const dayKey = (iso: string) => crLocal(iso).toISOString().slice(0, 10);

/** A payment still due, as a movement (PRM-02): same face, name and amount as the real one will have. Id: plan_<recurrent>_<date>. */
export function plannedTx(r: Recurring, date: string, fx: number): Tx {
  const each = toCrc(r.amount, r.currency, fx);
  const accRate = r.currency === 'USD' ? fx : 1;
  return {
    id: `plan_${r.id}_${date}`, space_id: r.space_id, kind: r.kind === 'contribution' ? 'transfer' : r.kind,
    amount: Number(r.amount), currency: r.currency, fx_rate: accRate, amount_crc: each,
    occurred_at: `${date}T18:00:00.000Z`, // noon in Costa Rica
    merchant: r.merchant, raw_merchant: null, note: null, category_id: r.category_id, account_id: r.account_id, to_account_id: r.to_account_id || null,
    contributor_id: null, recurring_id: r.id, status: 'posted', source: 'recurring', external_id: null, planned: true,
  };
}

export const isPlannedId = (id: string) => id.startsWith('plan_');
export const parsePlannedId = (id: string) => {
  const m = id.match(/^plan_(.+)_(\d{4}-\d{2}-\d{2})$/);
  return m ? { recurringId: m[1], date: m[2] } : null;
};

/** One recurrent this month: what was paid (its linked movements) and the payments still due. */
export interface RecMonth {
  r: Recurring;
  /** Its movements this month. */
  txs: Tx[];
  paid: number;
  /** Due dates still to pay this month (an overdue one from before counts too). */
  due: string[];
  /** One payment, in CRC (≈ the average when it varies). */
  each: number;
  /** paid + what's still due. */
  total: number;
  /** The payments still due, as movements. */
  planned: Tx[];
}

/** An open plan: an amount for a category that this month's spending eats up (PRM-04). */
export interface OpenPlan {
  line: Line;
  /** In CRC. */
  amount: number;
  spent: number;
  left: number;
  cats: Category[];
  txs: Tx[];
}

export type Section = 'in' | 'out' | 'save';

export interface PlanGroup {
  key: string;
  section: Section;
  /** The root category; null for movements without one (or the savings/income groups). */
  category: Category | null;
  title: string;
  recs: RecMonth[];
  plans: OpenPlan[];
  /** Real movements that no plan covers. */
  loose: Tx[];
  looseAmt: number;
  /** Real so far, in CRC. */
  real: number;
  /** Still planned: due payments and what's left of the open plans. */
  pending: number;
  total: number;
}

export interface Budget {
  income: PlanGroup;
  groups: PlanGroup[];
  save: PlanGroup;
  plans: OpenPlan[];
  /** Money in: real + planned. */
  entra: number;
  /** Spending: real + planned. */
  sale: number;
  /** Set apart or sent to another space: real + planned. */
  aparta: number;
  /** entra − sale − aparta (PRM-05). */
  free: number;
  /** Something planned or received this month. */
  hasIncome: boolean;
  /** What's left in the open plans (Inicio when there's no income yet). */
  toSpend: { left: number; total: number; count: number } | null;
}

/** Due dates of a recurrent inside [from, to) (an overdue one from before the month counts once). */
function dueDates(r: Recurring, from: string, to: string) {
  const out: string[] = [];
  if (!r.active) return out;
  // the next payment can be postponed (only that one); the ones after keep their dates
  const first = r.snooze_until && r.snooze_until > r.next_due ? r.snooze_until : r.next_due;
  let d = r.next_due;
  for (let i = 0; i < 80; i++) {
    const at = i === 0 ? first : d;
    if (at >= to) break;
    if (at >= from || i === 0) out.push(at); // an overdue one from before the month counts once
    const n = addPeriod(d, r.frequency, r.every_n, r.every_unit);
    if (n <= d) break;
    d = n;
  }
  return out;
}

const SAVE_KINDS = new Set(['savings', 'investment', 'cdp']);

/** Which section a recurrent belongs to, or null when it isn't part of the plan (card payments, moves between my own accounts). */
function recSection(r: Recurring, spaceId: string, accounts: Account[]): Section | null {
  if (r.purpose === 'card_early') return null;
  if (r.kind === 'income') return r.space_id === spaceId ? 'in' : null;
  if (r.kind === 'transfer') {
    const to = accounts.find((a) => a.id === r.to_account_id);
    if (r.space_id !== spaceId) return to && to.space_id === spaceId ? 'in' : null; // money another space plans to send here
    if (!to) return null;
    if (to.space_id !== spaceId || SAVE_KINDS.has(to.kind)) return 'save';
    return null;
  }
  return r.space_id === spaceId ? 'out' : null;
}

/** Which section a real movement belongs to, or null when it doesn't change what's free. */
function txSection(x: Tx, spaceId: string, accounts: Account[]): Section | null {
  if (x.hold === 'void' || x.hold === 'pending') return null;
  if (x.kind === 'transfer') {
    if (x.space_id !== spaceId) return x.to_space_id === spaceId ? 'in' : null;
    if (x.to_space_id && x.to_space_id !== spaceId) return 'save';
    const to = accounts.find((a) => a.id === x.to_account_id);
    return to && SAVE_KINDS.has(to.kind) ? 'save' : null;
  }
  if (x.space_id !== spaceId) return null;
  if (x.kind === 'income') return 'in';
  if (x.kind === 'expense' || x.kind === 'refund') return 'out';
  return null;
}

const txValue = (x: Tx, s: Section) => (s === 'out' ? spend(x) : Number(x.amount_crc));

export function buildBudget(o: { lines: Line[]; links: LineLink[]; recurring: Recurring[]; categories: Category[]; accounts: Account[]; txs: Tx[]; spaceId: string; fx: number }): Budget {
  const { categories, fx, spaceId, accounts } = o;
  const t = todayCR();
  const range = monthRange(t.y, t.m);
  const from = dayKey(range.from), to = dayKey(range.to);
  const monthTxs = o.txs.filter((x) => x.occurred_at >= range.from && x.occurred_at < range.to);

  const groups = new Map<string, PlanGroup>();
  const make = (key: string, section: Section, category: Category | null, title: string): PlanGroup => {
    let g = groups.get(key);
    if (!g) {
      g = { key, section, category, title, recs: [], plans: [], loose: [], looseAmt: 0, real: 0, pending: 0, total: 0 };
      groups.set(key, g);
    }
    return g;
  };
  const income = make('in', 'in', null, 'Entra');
  const save = make('save', 'save', null, 'Apartar');
  const outGroup = (catId: string | null | undefined) => {
    const rid = catId ? rootId(categories, catId) : null;
    const c = rid ? categories.find((x) => x.id === rid) || null : null;
    return make(c ? `c:${c.id}` : 'none', 'out', c, c ? c.name : 'Sin categoría');
  };
  const groupOf = (s: Section, catId: string | null | undefined) => (s === 'in' ? income : s === 'save' ? save : outGroup(catId));

  // 1. recurrents: paid this month and still due (PRM-02)
  const used = new Set<string>();
  for (const r of o.recurring) {
    const s = recSection(r, spaceId, accounts);
    if (!s) continue;
    const all = monthTxs.filter((x) => x.recurring_id === r.id && txSection(x, spaceId, accounts) === s);
    // a payment moved to another category goes with that category, not with its recurrent's (PRM-02)
    const home = s === 'out' ? outGroup(r.category_id) : groupOf(s, r.category_id);
    const txs = s === 'out' ? all.filter((x) => outGroup(x.category_id) === home) : all;
    for (const x of all) {
      if (txs.includes(x)) continue;
      used.add(x.id);
      const g = outGroup(x.category_id);
      g.loose.push(x);
      g.looseAmt += txValue(x, s);
    }
    const due = dueDates(r, from, to);
    if (!txs.length && !due.length) continue; // nothing left of it here (none due, its payments went elsewhere)
    txs.forEach((x) => used.add(x.id));
    const paid = txs.reduce((a, x) => a + txValue(x, s), 0);
    const each = toCrc(r.amount, r.currency, fx);
    groupOf(s, r.category_id).recs.push({ r, txs, paid, due, each, total: paid + each * due.length, planned: due.map((d) => plannedTx(r, d, fx)) });
  }

  // 2. open plans (PRM-04): one category (and its subcategories); movements of a recurrent don't count, it has its own row
  const plans: OpenPlan[] = [];
  for (const line of o.lines.filter((l) => l.active && !l.is_rest && l.kind === 'cap' && l.amount != null).sort((a, b) => a.sort - b.sort)) {
    const catIds = o.links.filter((l) => l.envelope_id === line.id).map((l) => l.category_id);
    const fam = new Set<string>();
    catIds.forEach((c) => familyIds(categories, c).forEach((x) => fam.add(x)));
    const txs = monthTxs.filter((x) => !used.has(x.id) && x.category_id && fam.has(x.category_id) && txSection(x, spaceId, accounts) === 'out' && spend(x) !== 0);
    txs.forEach((x) => used.add(x.id));
    const amount = toCrc(line.amount!, line.currency, fx);
    const spent = txs.reduce((a, x) => a + spend(x), 0);
    const plan: OpenPlan = { line, amount, spent, left: amount - spent, cats: categories.filter((c) => catIds.includes(c.id)), txs };
    plans.push(plan);
    const g = catIds.length ? outGroup(catIds[0]) : make(`p:${line.id}`, 'out', null, line.name);
    g.plans.push(plan);
  }

  // 3. everything else that came in or went out this month
  for (const x of monthTxs) {
    if (used.has(x.id)) continue;
    const s = txSection(x, spaceId, accounts);
    if (!s) continue;
    const v = txValue(x, s);
    if (v === 0) continue;
    const g = groupOf(s, x.category_id);
    g.loose.push(x);
    g.looseAmt += v;
  }

  for (const g of groups.values()) {
    const recReal = g.recs.reduce((a, s) => a + s.paid, 0);
    const recDue = g.recs.reduce((a, s) => a + s.each * s.due.length, 0);
    const planReal = g.plans.reduce((a, p) => a + p.spent, 0);
    const planLeft = g.plans.reduce((a, p) => a + Math.max(0, p.left), 0);
    g.real = recReal + planReal + g.looseAmt;
    g.pending = recDue + planLeft;
    g.total = g.real + g.pending;
    g.recs.sort((a, b) => (a.due[0] || '9999').localeCompare(b.due[0] || '9999') || b.total - a.total);
  }

  // every expense category is in the budget, even without movements this month (PRM-01)
  for (const c of categories.filter((x) => x.kind === 'expense' && !x.parent_id && !x.archived && x.space_id === spaceId)) outGroup(c.id);
  const out = [...groups.values()].filter((g) => g.section === 'out' && (g.recs.length || g.plans.length || g.loose.length || g.category)).sort((a, b) => b.total - a.total || a.title.localeCompare(b.title));
  const entra = income.total, aparta = save.total;
  const sale = out.reduce((a, g) => a + g.total, 0);
  return {
    income, groups: out, save, plans, entra, sale, aparta,
    free: entra - sale - aparta,
    hasIncome: entra > 0,
    toSpend: plans.length ? { left: plans.reduce((a, p) => a + p.left, 0), total: plans.reduce((a, p) => a + p.amount, 0), count: plans.length } : null,
  };
}

/** Open plans, their categories and the recurrents of a space (plus those of other spaces that send money here). */
export function useBudgetData(spaceId: string | null | undefined) {
  const { version, accounts } = useApp();
  const [d, setD] = useState<{ lines: Line[]; links: LineLink[]; recurring: Recurring[] } | null>(null);
  const mine = accounts.filter((a) => a.space_id === spaceId).map((a) => a.id).sort().join(',');
  useEffect(() => {
    if (!spaceId) return;
    let alive = true;
    const safe = <T,>(p: PromiseLike<T[]>) => Promise.resolve(p).catch(() => [] as T[]);
    const ids = mine ? mine.split(',') : [];
    Promise.all([
      safe(db.from<Line>('envelopes').eq('space_id', spaceId).order('sort')),
      safe(db.from<LineLink & { envelopes?: unknown }>('envelope_categories', 'category_id,envelope_id,envelopes!inner(space_id)').eq('envelopes.space_id', spaceId)),
      safe(db.from<Recurring>('recurring').eq('space_id', spaceId)),
      ids.length ? safe(db.from<Recurring>('recurring').eq('kind', 'transfer').eq('active', true).in('to_account_id', ids)) : Promise.resolve([] as Recurring[]),
    ]).then(([lines, links, recurring, incoming]) => {
      if (!alive) return;
      const extra = incoming.filter((r) => r.space_id !== spaceId);
      setD({ lines, links: links.map((l) => ({ category_id: l.category_id, envelope_id: l.envelope_id })), recurring: [...recurring, ...extra] });
    });
    return () => {
      alive = false;
    };
  }, [spaceId, version, mine]);
  return d;
}

/** Average monthly spending of a category (and its subcategories) over the last 3 full months, without recurrents (PRM-04). */
export function categoryAverage(txs: Tx[], categories: Category[], categoryId: string) {
  const t = todayCR();
  const from = monthRange(t.y, t.m - 3).from, to = monthRange(t.y, t.m).from;
  const fam = familyIds(categories, categoryId);
  const total = txs.filter((x) => x.occurred_at >= from && x.occurred_at < to && x.category_id && fam.has(x.category_id) && !x.recurring_id && x.hold !== 'void')
    .reduce((a, x) => a + spend(x), 0);
  return Math.max(0, total / 3);
}
