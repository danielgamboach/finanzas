import { snapshotMoment } from './calc';
import type { Account, Snapshot, Tx } from './types';

/**
 * Credit cards (docs/comportamiento/cuentas-y-saldos.md, TAR). Same rule as `card_owed` in the database:
 * what a card owes, in colones and in dollars, is its last typed-in balance plus charges, minus refunds and
 * payments since. An additional card has no balance of its own: its charges go to its main card.
 */

export interface Owed { CRC: number; USD: number }
type CardTx = Pick<Tx, 'kind' | 'amount' | 'currency' | 'account_id' | 'to_account_id' | 'occurred_at' | 'hold'> & { installments?: number | null };

/** The same moment, `k` months later (a day that doesn't exist moves to the month's last day). */
export function addMonths(iso: string, k: number) {
  if (!k) return iso;
  const d = new Date(iso);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + k;
  const day = Math.min(d.getUTCDate(), new Date(Date.UTC(y, m + 1, 0)).getUTCDate());
  return new Date(Date.UTC(y, m, day, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds())).toISOString();
}

/** One part of an installment purchase (TAR-11): the last one takes the rounding. */
export const installmentPart = (amount: number, n: number, k: number) => {
  const part = Math.round((amount / n) * 100) / 100;
  return k < n - 1 ? part : Math.round((amount - part * (n - 1)) * 100) / 100;
};

interface Entry { at: string; cur: 'CRC' | 'USD'; v: number; kind: 'charge' | 'payment' }
/**
 * What moves a card's balance, one entry per movement: charges (+), refunds (−), payments (−). An installment
 * purchase is one charge per month, from the day of the purchase (TAR-11).
 */
function cardEntries(family: Set<string>, txs: CardTx[]): Entry[] {
  const out: Entry[] = [];
  for (const t of txs) {
    if (t.hold) continue;
    const cur = t.currency === 'USD' ? 'USD' : 'CRC';
    const amt = Number(t.amount);
    if (t.kind === 'transfer' && t.to_account_id && family.has(t.to_account_id)) out.push({ at: t.occurred_at, cur, v: -amt, kind: 'payment' });
    else if (t.account_id && family.has(t.account_id) && t.kind === 'refund') out.push({ at: t.occurred_at, cur, v: -amt, kind: 'charge' });
    else if (t.account_id && family.has(t.account_id) && t.kind === 'expense') {
      const n = t.installments && t.installments > 1 ? t.installments : 1;
      for (let k = 0; k < n; k++) out.push({ at: addMonths(t.occurred_at, k), cur, v: n === 1 ? amt : installmentPart(amt, n, k), kind: 'charge' });
    }
  }
  return out;
}
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
  for (const e of cardEntries(family, txs)) if (e.at > since && e.at <= at) out[e.cur] += e.v;
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
  /** Installments of purchases already made that the card hasn't charged yet (TAR-11). */
  pendingInstallments: Owed;
}

const minus = (a: Owed, b: Owed): Owed => ({ CRC: a.CRC - b.CRC, USD: a.USD - b.USD });
const floor0 = (a: Owed): Owed => ({ CRC: Math.max(0, a.CRC), USD: Math.max(0, a.USD) });

export function cardStatus(main: Account, accounts: Account[], snaps: CardSnap[], txs: CardTx[], now = new Date().toISOString()): CardStatus {
  const fam = cardFamily(main.id, accounts);
  const owed = cardOwedAt(main, fam, snaps, txs, now);
  const payments = txs.filter((t) => t.kind === 'transfer' && !t.hold && t.to_account_id && fam.has(t.to_account_id) && t.occurred_at <= now);
  const lastPaymentAt = payments.reduce<string | null>((a, t) => (!a || t.occurred_at > a ? t.occurred_at : a), null);
  const entries = cardEntries(fam, txs).filter((e) => e.kind === 'charge');
  const charges = (from: string | null): Owed => {
    const o: Owed = { CRC: 0, USD: 0 };
    for (const e of entries) if ((!from || e.at > from) && e.at <= now) o[e.cur] += e.v;
    return o;
  };
  const pendingInstallments: Owed = { CRC: 0, USD: 0 };
  for (const e of entries) if (e.at > now) pendingInstallments[e.cur] += e.v;
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
  return { owed, cycle, sinceLastPayment, lastPaymentAt, pendingInstallments };
}

/** One number in colones: the colones part plus the dollars at today's rate. */
export const owedCrc = (o: Owed, fx: number) => o.CRC + o.USD * fx;
export const hasOwed = (o: Owed) => o.CRC >= 1 || o.USD >= 0.01;
