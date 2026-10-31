import { useEffect, useState } from 'react';
import { db } from './api';
import { crLocal, dateKey } from './format';
import type { Account, EveryUnit, Frequency, PayMethod, Recurring } from './types';
import { useApp } from '../store';

export const FREQ_LABEL: Record<Frequency, string> = {
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
  bimonthly: 'Cada 2 meses',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  yearly: 'Anual',
  custom: 'Personalizada',
};

type Period = Pick<Recurring, 'frequency' | 'every_n' | 'every_unit'>;
const UNIT_WORDS: Record<EveryUnit, [string, string]> = { day: ['día', 'días'], week: ['semana', 'semanas'], month: ['mes', 'meses'] };

/** "Mensual", or "Cada 10 días" for a custom period. */
export function freqLabel(r: Period) {
  if (r.frequency !== 'custom' || !r.every_n || !r.every_unit) return FREQ_LABEL[r.frequency];
  const [one, many] = UNIT_WORDS[r.every_unit];
  return r.every_n === 1 ? `Cada ${one}` : `Cada ${r.every_n} ${many}`;
}

export const METHOD_LABEL: Record<PayMethod, string> = { card: 'Tarjeta', transfer: 'Transferencia', cash: 'Efectivo' };

/** How many times per month this happens, to show a monthly total. */
export const PER_MONTH: Record<Frequency, number> = {
  weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, bimonthly: 1 / 2, quarterly: 1 / 3, semiannual: 1 / 6, yearly: 1 / 12, custom: 1,
};
/** Times per month, custom periods included. */
export function perMonth(r: Period) {
  if (r.frequency !== 'custom' || !r.every_n) return PER_MONTH[r.frequency];
  return 30.44 / (r.every_n * (r.every_unit === 'day' ? 1 : r.every_unit === 'week' ? 7 : 30.44));
}

const PERIOD_DAYS: Record<Frequency, number> = { weekly: 7, biweekly: 14, monthly: 30, bimonthly: 61, quarterly: 91, semiannual: 182, yearly: 365, custom: 30 };
export function periodDays(r: Period) {
  if (r.frequency !== 'custom' || !r.every_n) return PERIOD_DAYS[r.frequency];
  return r.every_n * (r.every_unit === 'day' ? 1 : r.every_unit === 'week' ? 7 : 30);
}
/** How many days before its date a payment counts as due (same rule as the database). */
export const leadDays = (f: Frequency | Period) => Math.min(10, Math.max(2, Math.floor((typeof f === 'string' ? PERIOD_DAYS[f] : periodDays(f)) / 3)));

/** Adds one period to a YYYY-MM-DD date (calendar months, like the database does). */
export function addPeriod(d: string, f: Frequency, n?: number | null, unit?: EveryUnit | null): string {
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  const months: Partial<Record<Frequency, number>> = { monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, yearly: 12 };
  if (f === 'custom' && n && unit !== 'month') dt.setUTCDate(dt.getUTCDate() + n * (unit === 'week' ? 7 : 1));
  else if (f === 'weekly') dt.setUTCDate(dt.getUTCDate() + 7);
  else if (f === 'biweekly') dt.setUTCDate(dt.getUTCDate() + 14);
  else {
    const target = new Date(Date.UTC(y, m - 1 + (f === 'custom' ? n || 1 : months[f] || 1), 1));
    const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
  }
  return dt.toISOString().slice(0, 10);
}

export const todayKey = () => dateKey(new Date().toISOString());

/** Whole days from today (CR) to the due date; negative when overdue. */
export function daysUntil(d: string) {
  const [y, m, day] = d.split('-').map(Number);
  const t = crLocal();
  return Math.round((Date.UTC(y, m - 1, day) - Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())) / 86400000);
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function shortDay(d: string) {
  const [, m, day] = d.split('-').map(Number);
  return `${day} ${MONTHS[m - 1]}`;
}

export function dueLabel(d: string) {
  const n = daysUntil(d);
  if (n < -1) return `Venció hace ${-n} días`;
  if (n === -1) return 'Venció ayer';
  if (n === 0) return 'Hoy';
  if (n === 1) return 'Mañana';
  if (n <= 6) return `En ${n} días`;
  return shortDay(d);
}

export type RecState = 'overdue' | 'due' | 'upcoming';
export function recState(r: Recurring): RecState {
  const n = daysUntil(r.next_due);
  if (n < 0) return 'overdue';
  if (n <= leadDays(r)) return 'due';
  return 'upcoming';
}

/** Transfers and cash can't be detected from vouchers, so we ask once they're due. */
/** Paid for the current period: it stays out of "próximos pagos" until its next due date gets close. */
export function paidRecently(r: Recurring) {
  if (!r.last_paid_on) return false;
  const since = -daysUntil(r.last_paid_on);
  return since >= 0 && since < periodDays(r) - leadDays(r) && recState(r) === 'upcoming';
}

/**
 * Paid by hand (SINPE, the bank's app, cash) unless the person marked it as an automatic charge (REC-02).
 * Automatic charges register on their own (run_auto_recurring in the database), so they never need confirming.
 */
export function isManual(r: Recurring, _accounts?: Pick<Account, 'id' | 'kind'>[]) {
  return r.auto === undefined ? r.method !== 'card' : !r.auto;
}

/** The day this payment shows as due: its date, or a later one it was postponed to (REC-07). */
export const dueDay = (r: Pick<Recurring, 'next_due' | 'snooze_until'>) =>
  r.snooze_until && r.snooze_until > r.next_due ? r.snooze_until : r.next_due;

/** A manual payment that hasn't been confirmed: asked from the day before it's due, and for as long as it's overdue. */
export const needsConfirm = (r: Recurring, accounts: Pick<Account, 'id' | 'kind'>[]) =>
  r.active && isManual(r, accounts) && daysUntil(dueDay(r)) <= 1;

/** An automatic charge for today (or still waiting for the bank's voucher): Inicio only says it (REC-08). */
export const chargesToday = (r: Recurring) =>
  r.active && !isManual(r) && ((daysUntil(dueDay(r)) <= 0 && daysUntil(r.next_due) >= -1) || (!!r.last_paid_on && daysUntil(r.last_paid_on) === 0));

/** A manual payment confirmed in the last few days: shown as completed for a little while. */
export function justPaid(r: Recurring, accounts: Pick<Account, 'id' | 'kind'>[], days = 3) {
  if (!r.active || !r.last_paid_on || !isManual(r, accounts)) return false;
  const since = -daysUntil(r.last_paid_on);
  return since >= 0 && since < days && recState(r) === 'upcoming';
}

/** Pattern to look for in the voucher text: the first meaningful word(s) of the merchant. */
export function patternFrom(raw: string | null | undefined) {
  const words = (raw || '').toUpperCase().replace(/HTTPS?:\/\/\S*/g, '').replace(/[^A-Z0-9*.&\s-]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const first = words[0];
  return first.length >= 4 || words.length === 1 ? first : `${first} ${words[1]}`;
}

export function useRecurring(spaceId: string | null | undefined) {
  const { version } = useApp();
  const [items, setItems] = useState<Recurring[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!spaceId) return;
    let alive = true;
    setLoading(true);
    db.from<Recurring>('recurring')
      .eq('space_id', spaceId)
      .order('next_due')
      .then((r) => alive && setItems(r))
      .catch(() => alive && setItems([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [spaceId, version]);
  return { items, loading };
}

/** Records the payment (from the account, for the amount and on the day the person chose); the database moves next_due forward. */
export async function payRecurring(r: Recurring, fx: number, userId: string | null, opts: { accountId?: string | null; amount?: number; when?: string } = {}): Promise<string | null> {
  const rows = await db.insert<{ id: string }>('transactions', {
    space_id: r.space_id,
    kind: r.kind,
    amount: opts.amount ?? r.amount,
    currency: r.currency,
    fx_rate: r.currency === 'USD' ? fx : 1,
    occurred_at: opts.when || new Date().toISOString(),
    merchant: r.merchant,
    category_id: r.kind === 'transfer' ? null : r.category_id,
    account_id: opts.accountId !== undefined ? opts.accountId : r.account_id,
    to_account_id: r.kind === 'transfer' ? r.to_account_id ?? null : null,
    recurring_id: r.id,
    status: 'posted',
    source: 'manual',
    category_source: r.category_id ? 'manual' : null,
    created_by: userId,
  });
  return rows[0]?.id ?? null;
}

/** Takes back a payment confirmed by mistake: removes the movement and restores the schedule as it was. */
export async function undoPayRecurring(before: Recurring, txId: string) {
  await db.remove('transactions', { id: txId });
  await db.update('recurring', { id: before.id }, { next_due: before.next_due, last_paid_on: before.last_paid_on, snooze_until: before.snooze_until ?? null });
}

export async function skipRecurring(r: Recurring) {
  await db.update('recurring', { id: r.id }, { next_due: addPeriod(r.next_due, r.frequency, r.every_n, r.every_unit), snooze_until: null });
}

/** Moves only this payment to another day; the next ones keep their dates. */
export async function snoozeRecurring(r: Recurring, day: string) {
  await db.update('recurring', { id: r.id }, { snooze_until: day });
}

/** Stops repeating it (it stays in "Pausados" and can be turned back on). */
export async function cancelRecurring(r: Recurring) {
  await db.update('recurring', { id: r.id }, { active: false, snooze_until: null });
}
