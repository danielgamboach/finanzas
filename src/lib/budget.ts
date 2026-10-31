import { useEffect, useState } from 'react';
import { db } from './api';
import { inRange, monthRange, spend } from './calc';
import { rootId } from './cats';
import { dateKey, todayCR } from './format';
import { addPeriod } from './recurring';
import type { Account, Category, Currency, Goal, Recurring, Tx } from './types';
import { useApp } from '../store';

/**
 * Presupuesto as the month's plan (docs/comportamiento/presupuesto.md, PRS):
 * the income, split ahead of time by what each line is: savings set apart first, fixed and variable
 * payments (from Recurrentes), limits on what can be spent (category limits), and what's left unassigned.
 */

export interface BudgetMonth { space_id: string; month: string; income: number | null; closed_at: string | null; carried: boolean | null }
export interface Saving { id: string; space_id: string; name: string; amount: number; currency: Currency; goal_id: string | null; active: boolean; sort: number }
export interface Carry { space_id: string; month: string; category_id: string; amount: number }

export type LineKind = 'saving' | 'fixed' | 'variable' | 'limit' | 'unplanned';

export interface PlanLine {
  key: string;
  kind: LineKind;
  title: string;
  /** What the plan expects for the month, in CRC (a paid fixed/variable line uses what was really paid). */
  planned: number;
  /** What already happened: paid, set apart, or spent against the limit. */
  actual: number;
  /** Paid / set apart. A limit is never "done". */
  done: boolean;
  /** Payments still to come this month (fixed and variable), with their dates. */
  due: string[];
  /** Last day it was paid this month. */
  paidOn: string | null;
  cat?: Category;
  recurring?: Recurring;
  saving?: Saving;
  goal?: Goal;
  /** Limit lines: the part that came from last month's leftover. */
  carry?: number;
}

export interface Plan {
  monthKey: string;
  income: number;
  /** Where the income comes from: typed for the month, the recurring incomes, or nothing yet. */
  incomeSource: 'manual' | 'recurring' | 'none';
  /** Income the recurrents expect this month (to offer when the person typed another). */
  incomeRecurring: number;
  /** Income that really came in this month (incomes, plus money moved here from other spaces). */
  received: number;
  savings: PlanLine[];
  fixed: PlanLine[];
  variable: PlanLine[];
  limits: PlanLine[];
  unplanned: PlanLine[];
  total: Record<'savings' | 'fixed' | 'variable' | 'limits', number>;
  /** income − savings − fixed − variable − limits. Negative: more assigned than comes in. */
  unassigned: number;
  /** Spending that isn't a planned payment: it goes against the limits (or "Sin plan"). */
  flexSpent: number;
  /**
   * "Disponible" on Inicio once there is an income: what's left of the month after what's committed
   * (savings and payments, paid or not) and what was spent. PRS-07.
   */
  available: number | null;
  /** Anything to show beyond the old category limits. */
  hasPlan: boolean;
}

/** "2026-10-01" for a [year, month0] pair (months can overflow). */
export function monthKey(y: number, m: number) {
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/** Due dates of a recurrent inside [from, to) (YYYY-MM-DD), stepping from its next due date. */
export function dueDatesIn(r: Recurring, from: string, to: string) {
  const out: string[] = [];
  let d = r.snooze_until && r.snooze_until > r.next_due ? r.snooze_until : r.next_due;
  for (let i = 0; i < 400 && d < to; i++) {
    if (d >= from) out.push(d);
    const n = addPeriod(d, r.frequency, r.every_n, r.every_unit);
    if (n <= d) break;
    d = n;
  }
  return out;
}

const toCrc = (amount: number, currency: Currency, fx: number) => (currency === 'USD' ? Number(amount) * fx : Number(amount));

/** Monthly equivalent of a category limit (weekly limits: one per week of the month). */
export function monthlyLimit(c: Category, daysInMonth: number) {
  if (c.limit_amount == null) return null;
  return c.limit_period === 'weekly' ? Math.round(Number(c.limit_amount) * (daysInMonth / 7)) : Number(c.limit_amount);
}

export function buildPlan(o: {
  ym: [number, number];
  spaceId: string;
  txs: Tx[];
  categories: Category[];
  accounts: Account[];
  recurring: Recurring[];
  savings: Saving[];
  goals: Goal[];
  months: BudgetMonth[];
  carry: Carry[];
  marks: { saving_id: string; month: string }[];
  fx: number;
}): Plan {
  const { ym, spaceId, categories, fx } = o;
  const key = monthKey(ym[0], ym[1]);
  const next = monthKey(ym[0], ym[1] + 1);
  const range = monthRange(ym[0], ym[1]);
  const daysInMonth = new Date(Date.UTC(ym[0], ym[1] + 1, 0)).getUTCDate();
  const inMonth = o.txs.filter((x) => inRange(x, range) && x.hold !== 'void');
  const mine = inMonth.filter((x) => x.space_id === spaceId);
  const ownAccounts = new Set(o.accounts.filter((a) => a.space_id === spaceId).map((a) => a.id));

  // --- fixed and variable: expenses, and money that leaves this space for another one (PRS-02, PRS-03)
  const lines: PlanLine[] = [];
  const planIds = new Set<string>();
  for (const r of o.recurring) {
    const leaves = r.kind === 'transfer' && !!r.to_account_id && !ownAccounts.has(r.to_account_id);
    if (r.kind !== 'expense' && !leaves) continue;
    const paidTxs = mine.filter((x) => x.recurring_id === r.id);
    const paid = paidTxs.reduce((a, x) => a + (x.kind === 'transfer' ? Number(x.amount_crc) : spend(x)), 0);
    const due = r.active ? dueDatesIn(r, key, next) : [];
    if (!paidTxs.length && !due.length) continue;
    planIds.add(r.id);
    const each = toCrc(r.amount, r.currency, fx);
    const cat = categories.find((c) => c.id === r.category_id);
    lines.push({
      key: `r:${r.id}`,
      kind: r.variable ? 'variable' : 'fixed',
      title: r.merchant,
      planned: paid + due.length * each,
      actual: paid,
      done: due.length === 0 && paidTxs.length > 0,
      due,
      paidOn: paidTxs.length ? dateKey(paidTxs.map((x) => x.occurred_at).sort().at(-1)!) : null,
      cat,
      recurring: r,
    });
  }
  const byDate = (a: PlanLine, b: PlanLine) => Number(a.done) - Number(b.done) || (a.due[0] || a.paidOn || '').localeCompare(b.due[0] || b.paidOn || '');
  const fixed = lines.filter((l) => l.kind === 'fixed').sort(byDate);
  const variable = lines.filter((l) => l.kind === 'variable').sort(byDate);
  const planCats = new Set(lines.map((l) => rootId(categories, l.recurring!.category_id)).filter(Boolean) as string[]);

  // --- spending that isn't a planned payment goes against the category limits (PRS-04)
  const flex = mine.filter((x) => spend(x) !== 0 && !(x.recurring_id && planIds.has(x.recurring_id)));
  const flexSpent = flex.reduce((a, x) => a + spend(x), 0);
  const byRoot = new Map<string, number>();
  for (const x of flex) {
    const r = rootId(categories, x.category_id) || '';
    byRoot.set(r, (byRoot.get(r) || 0) + spend(x));
  }

  const limits: PlanLine[] = [];
  const unplanned: PlanLine[] = [];
  const roots = categories.filter((c) => c.kind === 'expense' && !c.archived && !c.parent_id).sort((a, b) => a.sort - b.sort);
  for (const c of roots) {
    const spent = byRoot.get(c.id) || 0;
    const base = monthlyLimit(c, daysInMonth);
    // a fixed category whose payment already is a plan line would count twice (PRS-04)
    const superseded = c.is_fixed && planCats.has(c.id);
    const carry = o.carry.filter((k) => k.month === key && k.category_id === c.id).reduce((a, k) => a + Number(k.amount), 0);
    if (base != null && !superseded) {
      limits.push({ key: `c:${c.id}`, kind: 'limit', title: c.name, planned: base + carry, actual: spent, done: false, due: [], paidOn: null, cat: c, carry: carry || undefined });
    } else if (spent > 0) {
      unplanned.push({ key: `u:${c.id}`, kind: 'unplanned', title: c.name, planned: 0, actual: spent, done: false, due: [], paidOn: null, cat: c });
    }
  }
  const loose = byRoot.get('') || 0;
  if (loose > 0) unplanned.push({ key: 'u:none', kind: 'unplanned', title: 'Sin categoría', planned: 0, actual: loose, done: false, due: [], paidOn: null });
  unplanned.sort((a, b) => b.actual - a.actual);

  // --- savings, set apart at the start of the month (PRS-05)
  const savings: PlanLine[] = o.savings.filter((s) => s.active).sort((a, b) => a.sort - b.sort).map((s) => {
    const goal = o.goals.find((g) => g.id === s.goal_id);
    const accs = new Set((goal?.goal_accounts || []).map((g) => g.account_id));
    const moved = accs.size
      ? inMonth.filter((x) => !x.hold && ((x.kind === 'transfer' && x.to_account_id && accs.has(x.to_account_id) && !(x.account_id && accs.has(x.account_id))) || (x.kind === 'income' && x.account_id && accs.has(x.account_id))))
          .reduce((a, x) => a + Number(x.amount_crc), 0)
      : 0;
    const planned = toCrc(s.amount, s.currency, fx);
    const marked = o.marks.some((m) => m.saving_id === s.id && m.month === key);
    const actual = marked ? Math.max(planned, moved) : moved;
    return { key: `s:${s.id}`, kind: 'saving', title: s.name, planned, actual, done: actual >= planned - 0.5, due: [], paidOn: null, saving: s, goal };
  });

  // --- income (PRS-01)
  const incomeRecurring = o.recurring
    .filter((r) => r.kind === 'income')
    .reduce((a, r) => {
      const got = mine.filter((x) => x.recurring_id === r.id && x.kind === 'income').reduce((s, x) => s + Number(x.amount_crc), 0);
      const due = r.active ? dueDatesIn(r, key, next).length : 0;
      return a + got + due * toCrc(r.amount, r.currency, fx);
    }, 0);
  const received = inMonth
    .filter((x) => !x.hold && ((x.kind === 'income' && x.space_id === spaceId) || (x.kind === 'transfer' && x.to_space_id === spaceId && x.space_id !== spaceId)))
    .reduce((a, x) => a + Number(x.amount_crc), 0);
  const row = o.months.find((m) => m.month === key);
  const manual = row?.income != null ? Number(row.income) : null;
  const income = manual ?? incomeRecurring;
  const incomeSource = manual != null ? 'manual' : incomeRecurring > 0 ? 'recurring' : 'none';

  const sum = (ls: PlanLine[], f: (l: PlanLine) => number = (l) => l.planned) => ls.reduce((a, l) => a + f(l), 0);
  const total = {
    savings: sum(savings, (l) => Math.max(l.planned, l.actual)),
    fixed: sum(fixed),
    variable: sum(variable),
    limits: sum(limits),
  };
  const unassigned = income - total.savings - total.fixed - total.variable - total.limits;
  const available = income > 0 ? income - total.savings - total.fixed - total.variable - flexSpent : null;
  return {
    monthKey: key, income, incomeSource, incomeRecurring, received,
    savings, fixed, variable, limits, unplanned, total, unassigned, flexSpent, available,
    hasPlan: income > 0 || savings.length > 0 || fixed.length > 0 || variable.length > 0,
  };
}

/** Days left in the month counting today (for the pace of a limit, PRS-04). */
export function daysLeft(ym: [number, number]) {
  const t = todayCR();
  if (t.y !== ym[0] || t.m !== ym[1]) return null;
  return new Date(Date.UTC(ym[0], ym[1] + 1, 0)).getUTCDate() - t.d + 1;
}

/** What the plan needs besides the movements: recurrents, savings, goals, month rows, carries and marks. */
export function usePlanData(spaceId: string | null | undefined) {
  const { version } = useApp();
  const [d, setD] = useState<{ recurring: Recurring[]; savings: Saving[]; goals: Goal[]; months: BudgetMonth[]; carry: Carry[]; marks: { saving_id: string; month: string }[] } | null>(null);
  useEffect(() => {
    if (!spaceId) return;
    let alive = true;
    const safe = <T,>(p: PromiseLike<T[]>) => Promise.resolve(p).catch(() => [] as T[]);
    Promise.all([
      safe(db.from<Recurring>('recurring').eq('space_id', spaceId)),
      safe(db.from<Saving>('budget_savings').eq('space_id', spaceId).eq('active', true).order('sort')),
      safe(db.from<Goal>('goals', '*,goal_accounts(account_id)').eq('space_id', spaceId)),
      safe(db.from<BudgetMonth>('budget_months').eq('space_id', spaceId)),
      safe(db.from<Carry>('budget_carry').eq('space_id', spaceId)),
      safe(db.from<{ saving_id: string; month: string }>('budget_saving_marks', 'saving_id,month,budget_savings!inner(space_id)').eq('budget_savings.space_id', spaceId)),
    ]).then(([recurring, savings, goals, months, carry, marks]) => {
      if (alive) setD({ recurring, savings, goals, months, carry, marks });
    });
    return () => {
      alive = false;
    };
  }, [spaceId, version]);
  return d;
}
