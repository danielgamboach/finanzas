import type { Currency } from './types';

// Costa Rica uses UTC-6 all year (no DST), so local dates are a fixed offset.
const CR_OFFSET_MS = 6 * 60 * 60 * 1000;

const thousands = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Formats an amount that is stored in colones, shown in the chosen currency. */
export function money(crc: number, cur: Currency, fx: number, opts: { sign?: '+' | '-' | ''; decimals?: boolean } = {}) {
  const v = cur === 'USD' ? crc / fx : crc;
  return moneyRaw(v, cur, opts);
}

/** Formats an amount already in its own currency. */
export function moneyRaw(v: number, cur: Currency, opts: { sign?: '+' | '-' | ''; decimals?: boolean } = {}) {
  const abs = Math.abs(v);
  const showDec = opts.decimals ?? cur === 'USD';
  const fixed = showDec ? abs.toFixed(2) : Math.round(abs).toString();
  const [int, dec] = fixed.split('.');
  const body = thousands(int) + (dec !== undefined ? ',' + dec : '');
  return (opts.sign ?? '') + (cur === 'USD' ? '$' : '₡') + body;
}

export function moneyParts(crc: number, cur: Currency, fx: number) {
  const v = cur === 'USD' ? crc / fx : crc;
  return { sym: cur === 'USD' ? '$' : '₡', num: thousands(Math.round(Math.abs(v)).toString()), negative: v < 0 };
}

export function shortK(crc: number, cur: Currency, fx: number) {
  const v = cur === 'USD' ? crc / fx : crc;
  const sym = cur === 'USD' ? '$' : '₡';
  if (Math.abs(v) >= 1_000_000) return `${sym}${(v / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (Math.abs(v) >= 10_000) return `${sym}${Math.round(v / 1000)}k`;
  return moneyRaw(v, cur, { decimals: false });
}

/** A Date shifted so that its UTC getters read Costa Rica local time. */
export function crLocal(d: Date | string = new Date()) {
  const t = typeof d === 'string' ? new Date(d).getTime() : d.getTime();
  return new Date(t - CR_OFFSET_MS);
}

/** ISO string for a CR local wall-clock date at a time. */
export function crIso(y: number, m: number, day: number, h = 0, min = 0) {
  return new Date(Date.UTC(y, m, day, h, min) + CR_OFFSET_MS).toISOString();
}

export function todayCR() {
  const l = crLocal();
  return { y: l.getUTCFullYear(), m: l.getUTCMonth(), d: l.getUTCDate(), dow: l.getUTCDay() };
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export const monthName = (m: number) => MONTHS[m];
export const monthShort = (m: number) => MONTHS_SHORT[m];
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function dayLabel(iso: string) {
  const l = crLocal(iso);
  const t = todayCR();
  const y = l.getUTCFullYear(), m = l.getUTCMonth(), d = l.getUTCDate();
  const base = `${DOW[l.getUTCDay()]} ${d} ${MONTHS_SHORT[m]}`;
  if (y === t.y && m === t.m && d === t.d) return `Hoy · ${base}`;
  const yest = crLocal(new Date(Date.now() - 86400000));
  if (y === yest.getUTCFullYear() && m === yest.getUTCMonth() && d === yest.getUTCDate()) return `Ayer · ${base}`;
  return cap(base);
}

/** Compact age: "ahora", "5m", "3h", "2d", "1w", then a short date. */
export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'ahora';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  if (s < 35 * 86400) return `${Math.floor(s / (7 * 86400))}w`;
  return shortDate(iso);
}

/** "Hoy", "Ayer" or "vie 16 oct". */
export function relDay(iso: string) {
  const k = dateKey(iso);
  if (k === dateKey(new Date().toISOString())) return 'Hoy';
  if (k === dateKey(new Date(Date.now() - 86400000).toISOString())) return 'Ayer';
  return shortDate(iso);
}

export function shortDate(iso: string) {
  const l = crLocal(iso);
  return `${DOW[l.getUTCDay()]} ${l.getUTCDate()} ${MONTHS_SHORT[l.getUTCMonth()]}`;
}

export function dateKey(iso: string) {
  const l = crLocal(iso);
  return `${l.getUTCFullYear()}-${String(l.getUTCMonth() + 1).padStart(2, '0')}-${String(l.getUTCDate()).padStart(2, '0')}`;
}

/** Value for <input type="datetime-local"> in CR time */
export function toInputDateTime(iso: string) {
  const l = crLocal(iso);
  return l.toISOString().slice(0, 16);
}

export function fromInputDateTime(v: string) {
  // v = 'YYYY-MM-DDTHH:mm' wall clock in CR
  const [date, time = '12:00'] = v.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return crIso(y, m - 1, d, h, mi);
}

export function parseAmount(s: string) {
  const clean = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : 0;
}
