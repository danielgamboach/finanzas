import { snapshotMoment } from './calc';
import type { Account, Snapshot, Tx } from './types';

/**
 * Credit cards (docs/comportamiento/cuentas-y-saldos.md, TAR). Same rule as `card_owed` in the database:
 * what a card owes, in colones and in dollars, is its last typed-in balance plus charges, minus refunds and
 * payments since. An additional card has no balance of its own: its charges go to its main card.
 */

export interface Owed { CRC: number; USD: number }
type CardTx = Pick<Tx, 'kind' | 'amount' | 'currency' | 'account_id' | 'to_account_id' | 'occurred_at' | 'hold'>;
type CardSnap = Pick<Snapshot, 'account_id' | 'balance' | 'taken_on' | 'created_at' | 'balance_usd'>;

const CR = 6 * 3600000;
/** A Costa Rica date (YYYY-MM-DD) → the instant its day ends. */
export const endOfDayCR = (d: string) => new Date(new Date(`${d}T00:00:00-06:00`).getTime() + 86400000 - 1).toISOString();
const crDay = (iso: string) => new Date(new Date(iso).getTime() - CR).toISOString().slice(0, 10);
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const ymd = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
/** That day of a month, or the month's last day if it's shorter (a statement on the 31st closes on the 30th). */
const clampDay = (y: number, m: number, d: number) => ymd(y, m, Math.min(d, daysIn(y, m)));

export const mainCardId = (a: Pick<Account, 'id' | 'parent_account_id'>) => a.parent_account_id || a.id;
export const isAdditional = (a: Pick<Account, 'kind' | 'parent_account_id'>) => a.kind === 'credit_card' && !!a.parent_account_id;
/** The main card and its additional cards. */
export const cardFamily = (mainId: string, accounts: Pick<Account, 'id' | 'parent_account_id'>[]) =>
  new Set([mainId, ...accounts.filter((a) => a.parent_account_id === mainId).map((a) => a.id)]);

/** The last statement date strictly before the day of `at` (a statement closes at the end of its day). */
export function lastCut(statementDay: number, at = new Date().toISOString()) {
  const today = crDay(at);
  const [y, m] = today.split('-').map(Number);
  const c = clampDay(y, m - 1, statementDay);
  return c < today ? c : clampDay(y, m - 2, statementDay);
}
export function nextCut(statementDay: number, at = new Date().toISOString()) {
  const [y, m] = lastCut(statementDay, at).split('-').map(Number);
  return clampDay(y, m, statementDay);
}
/** The last day to pay a statement: the due day after the statement (same month if it comes later, else the next). */
export function dueAfter(cut: string, statementDay: number, dueDay: number) {
  const [y, m] = cut.split('-').map(Number);
  return clampDay(y, dueDay > statementDay ? m - 1 : m, dueDay);
}

/** What the card owes at `at`. Without a typed-in balance it counts from the previous statement (or the month). */
export function cardOwedAt(main: Pick<Account, 'id' | 'statement_day'>, family: Set<string>, snaps: CardSnap[], txs: CardTx[], at: string): Owed {
  const base = snaps
    .filter((s) => s.account_id === main.id && snapshotMoment(s) <= at)
    .sort((a, b) => (snapshotMoment(a) < snapshotMoment(b) ? 1 : -1))[0];
  let since: string;
  const out: Owed = { CRC: 0, USD: 0 };
  if (base) {
    since = snapshotMoment(base);
    out.CRC = Number(base.balance) || 0;
    out.USD = Number(base.balance_usd) || 0;
  } else if (main.statement_day) {
    since = endOfDayCR(lastCut(main.statement_day, at));
  } else {
    const d = crDay(at);
    since = new Date(new Date(`${d.slice(0, 8)}01T00:00:00-06:00`).getTime() - 1).toISOString();
  }
  for (const t of txs) {
    if (t.hold || t.occurred_at <= since || t.occurred_at > at) continue;
    let v = 0;
    if (t.account_id && family.has(t.account_id)) v = t.kind === 'expense' ? 1 : t.kind === 'refund' ? -1 : 0;
    if (t.kind === 'transfer' && t.to_account_id && family.has(t.to_account_id)) v = -1;
    if (v) out[t.currency === 'USD' ? 'USD' : 'CRC'] += v * Number(t.amount);
  }
  return out;
}

export interface CardStatus {
  owed: Owed;
  /** With statement and due days: the last statement, what it said, what's been paid since and what's left of it. */
  cycle: null | {
    cut: string; nextCut: string; due: string;
    statement: Owed; paidSince: Owed; left: Owed; chargedSince: Owed;
    /** Days until the due date (negative: overdue). */
    daysToDue: number;
  };
  /** Charged since the last payment: what an early payment would cover. */
  sinceLastPayment: Owed;
  lastPaymentAt: string | null;
}

const minus = (a: Owed, b: Owed): Owed => ({ CRC: a.CRC - b.CRC, USD: a.USD - b.USD });
const floor0 = (a: Owed): Owed => ({ CRC: Math.max(0, a.CRC), USD: Math.max(0, a.USD) });

export function cardStatus(main: Account, accounts: Account[], snaps: CardSnap[], txs: CardTx[], now = new Date().toISOString()): CardStatus {
  const fam = cardFamily(main.id, accounts);
  const owed = cardOwedAt(main, fam, snaps, txs, now);
  const payments = txs.filter((t) => t.kind === 'transfer' && !t.hold && t.to_account_id && fam.has(t.to_account_id) && t.occurred_at <= now);
  const lastPaymentAt = payments.reduce<string | null>((a, t) => (!a || t.occurred_at > a ? t.occurred_at : a), null);
  const charges = (from: string | null): Owed => {
    const o: Owed = { CRC: 0, USD: 0 };
    for (const t of txs) {
      if (t.hold || !t.account_id || !fam.has(t.account_id) || (from && t.occurred_at <= from) || t.occurred_at > now) continue;
      const v = t.kind === 'expense' ? 1 : t.kind === 'refund' ? -1 : 0;
      o[t.currency === 'USD' ? 'USD' : 'CRC'] += v * Number(t.amount);
    }
    return o;
  };
  // never more than what's owed: an early payment covers what was charged since the last one
  const since = charges(lastPaymentAt);
  const sinceLastPayment = floor0({ CRC: Math.min(since.CRC, owed.CRC), USD: Math.min(since.USD, owed.USD) });
  let cycle: CardStatus['cycle'] = null;
  if (main.statement_day && main.due_day) {
    const cut = lastCut(main.statement_day, now);
    const cutAt = endOfDayCR(cut);
    const statement = floor0(cardOwedAt(main, fam, snaps, txs, cutAt));
    const paidSince: Owed = { CRC: 0, USD: 0 };
    for (const t of payments) if (t.occurred_at > cutAt) paidSince[t.currency === 'USD' ? 'USD' : 'CRC'] += Number(t.amount);
    const due = dueAfter(cut, main.statement_day, main.due_day);
    const daysToDue = Math.round((new Date(`${due}T00:00:00Z`).getTime() - new Date(`${crDay(now)}T00:00:00Z`).getTime()) / 86400000);
    cycle = { cut, nextCut: nextCut(main.statement_day, now), due, statement, paidSince, left: floor0(minus(statement, paidSince)), chargedSince: charges(cutAt), daysToDue };
  }
  return { owed, cycle, sinceLastPayment, lastPaymentAt };
}

/** One number in colones: the colones part plus the dollars at today's rate. */
export const owedCrc = (o: Owed, fx: number) => o.CRC + o.USD * fx;
export const hasOwed = (o: Owed) => o.CRC >= 1 || o.USD >= 0.01;
