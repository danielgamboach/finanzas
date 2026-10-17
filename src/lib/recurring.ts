import { useEffect, useState } from 'react';
import { db } from './api';
import { crLocal, dateKey } from './format';
import type { Frequency, PayMethod, Recurring } from './types';
import { useApp } from '../store';

export const FREQ_LABEL: Record<Frequency, string> = {
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
  bimonthly: 'Cada 2 meses',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  yearly: 'Anual',
};

export const METHOD_LABEL: Record<PayMethod, string> = { card: '💳 Tarjeta', transfer: '🏦 Transferencia', cash: '💵 Efectivo' };

/** How many times per month this happens, to show a monthly total. */
export const PER_MONTH: Record<Frequency, number> = {
  weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, bimonthly: 1 / 2, quarterly: 1 / 3, semiannual: 1 / 6, yearly: 1 / 12,
};

const PERIOD_DAYS: Record<Frequency, number> = { weekly: 7, biweekly: 14, monthly: 30, bimonthly: 61, quarterly: 91, semiannual: 182, yearly: 365 };
export const leadDays = (f: Frequency) => Math.min(10, Math.max(2, Math.floor(PERIOD_DAYS[f] / 3)));

/** Adds one period to a YYYY-MM-DD date (calendar months, like the database does). */
export function addPeriod(d: string, f: Frequency): string {
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  const months: Partial<Record<Frequency, number>> = { monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, yearly: 12 };
  if (f === 'weekly') dt.setUTCDate(dt.getUTCDate() + 7);
  else if (f === 'biweekly') dt.setUTCDate(dt.getUTCDate() + 14);
  else {
    const target = new Date(Date.UTC(y, m - 1 + (months[f] || 1), 1));
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
  if (n <= leadDays(r.frequency)) return 'due';
  return 'upcoming';
}

/** Transfers and cash can't be detected from vouchers, so we ask once they're due. */
export const needsConfirm = (r: Recurring) => r.active && r.method !== 'card' && recState(r) !== 'upcoming';

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

/** Records the payment; the database moves next_due forward. */
export async function payRecurring(r: Recurring, fx: number, userId: string | null) {
  await db.insert('transactions', {
    space_id: r.space_id,
    kind: r.kind,
    amount: r.amount,
    currency: r.currency,
    fx_rate: r.currency === 'USD' ? fx : 1,
    occurred_at: new Date().toISOString(),
    merchant: r.merchant,
    category_id: r.category_id,
    account_id: r.account_id,
    recurring_id: r.id,
    status: 'posted',
    source: 'manual',
    category_source: r.category_id ? 'manual' : null,
    created_by: userId,
  });
}

export async function skipRecurring(r: Recurring) {
  await db.update('recurring', { id: r.id }, { next_due: addPeriod(r.next_due, r.frequency) });
}
