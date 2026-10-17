import { useState } from 'react';
import { monthRange, weekRange, type Range } from './calc';
import { cap, crIso, monthName, todayCR } from './format';

/** today | week | lastweek | month | lastmonth | 30d | 90d | year | m:YYYY-MM | c:YYYY-MM-DD:YYYY-MM-DD */
export type PeriodKey = string;

export const PRESETS: [PeriodKey, string][] = [
  ['today', 'Hoy'],
  ['week', 'Esta semana'],
  ['lastweek', 'Semana pasada'],
  ['month', 'Este mes'],
  ['lastmonth', 'Mes pasado'],
  ['30d', 'Últimos 30 días'],
  ['90d', 'Últimos 3 meses'],
  ['year', 'Este año'],
];

const ymd = (iso: string) => iso.slice(0, 10);

export function periodRange(key: PeriodKey, weekStart: number): Range & { label: string } {
  const t = todayCR();
  if (key === 'today') return { from: crIso(t.y, t.m, t.d), to: crIso(t.y, t.m, t.d + 1), label: 'Hoy' };
  if (key === 'week') return { ...weekRange(weekStart), label: 'Esta semana' };
  if (key === 'lastweek') return { ...weekRange(weekStart, -1), label: 'Semana pasada' };
  if (key === 'lastmonth') {
    const r = monthRange(t.y, t.m - 1);
    return { ...r, label: cap(monthName((t.m + 11) % 12)) };
  }
  if (key === '30d') return { from: crIso(t.y, t.m, t.d - 29), to: crIso(t.y, t.m, t.d + 1), label: 'Últimos 30 días' };
  if (key === '90d') return { from: crIso(t.y, t.m - 3, t.d + 1), to: crIso(t.y, t.m, t.d + 1), label: 'Últimos 3 meses' };
  if (key === 'year') return { from: crIso(t.y, 0, 1), to: crIso(t.y + 1, 0, 1), label: `Este año` };
  if (key.startsWith('m:')) {
    const [y, m] = key.slice(2).split('-').map(Number);
    return { ...monthRange(y, m - 1), label: `${cap(monthName(m - 1))}${y !== t.y ? ` ${y}` : ''}` };
  }
  if (key.startsWith('c:')) {
    const [, a, b] = key.split(':');
    const [ya, ma, da] = a.split('-').map(Number);
    const [yb, mb, db] = b.split('-').map(Number);
    return { from: crIso(ya, ma - 1, da), to: crIso(yb, mb - 1, db + 1), label: `${da}/${ma} al ${db}/${mb}${yb !== t.y ? `/${yb}` : ''}` };
  }
  return { ...monthRange(t.y, t.m), label: cap(monthName(t.m)) };
}

/** The last 12 months as picker options. */
export function recentMonths(n = 12): [PeriodKey, string][] {
  const t = todayCR();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(t.y, t.m - i, 1));
    const y = d.getUTCFullYear(), m = d.getUTCMonth();
    return [`m:${y}-${String(m + 1).padStart(2, '0')}`, `${cap(monthName(m))} ${y}`];
  });
}

/** Moves a month-like period one step back or forward (for the arrows). */
export function shiftPeriod(key: PeriodKey, dir: -1 | 1): PeriodKey | null {
  const t = todayCR();
  let y = t.y, m = t.m;
  if (key === 'lastmonth') m -= 1;
  else if (key.startsWith('m:')) [y, m] = key.slice(2).split('-').map((v, i) => (i ? Number(v) - 1 : Number(v)));
  else if (key !== 'month') return null;
  const d = new Date(Date.UTC(y, m + dir, 1));
  if (d.getUTCFullYear() > t.y || (d.getUTCFullYear() === t.y && d.getUTCMonth() > t.m)) return null;
  if (d.getUTCFullYear() === t.y && d.getUTCMonth() === t.m) return 'month';
  return `m:${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export const customKey = (from: string, to: string) => `c:${from}:${to}`;
export const customParts = (key: PeriodKey) => (key.startsWith('c:') ? key.split(':').slice(1) : null);

/** Period state remembered per screen in this browser (a convenience only). */
export function usePeriod(screen: string, fallback: PeriodKey = 'month'): [PeriodKey, (k: PeriodKey) => void] {
  const storageKey = `finanzas.period.${screen}`;
  const [key, setKey] = useState<PeriodKey>(() => {
    const fromUrl = new URLSearchParams(location.hash.split('?')[1] || '').get('p');
    if (fromUrl) return fromUrl;
    try {
      return localStorage.getItem(storageKey) || fallback;
    } catch {
      return fallback;
    }
  });
  const set = (k: PeriodKey) => {
    setKey(k);
    try {
      localStorage.setItem(storageKey, k);
    } catch {
      /* storage unavailable */
    }
  };
  return [key, set];
}

export { ymd };
