import { useEffect, useMemo, useState } from 'react';
import { db } from './api';
import { spend } from './calc';
import { cap, crLocal, monthName, monthShort, todayCR } from './format';
import type { Tx } from './types';

/** The quick ranges of the Inicio chart. */
export type Span = 'D' | 'S' | 'M' | '6M' | '1A' | 'YTD';
export const SPANS: { value: Span; label: string; aria: string }[] = [
  { value: 'D', label: 'D', aria: 'Hoy' },
  { value: 'S', label: 'S', aria: 'Esta semana' },
  { value: 'M', label: 'M', aria: 'Este mes' },
  { value: '6M', label: '6M', aria: 'Últimos 6 meses' },
  { value: '1A', label: '1A', aria: 'Último año' },
  { value: 'YTD', label: 'YTD', aria: 'Este año a la fecha' },
];

const DAY = 86400000;
const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** A Costa Rica calendar day as a UTC midnight Date (only its UTC getters mean anything). */
const cd = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY);
export const ymdOf = (d: Date) => d.toISOString().slice(0, 10);

export interface ChartBar {
  /** Spend in this bar; null when it's still in the future. */
  value: number | null;
  /** The same bar in the period it's compared with; null when that period has no such bar. */
  prev: number | null;
  title: string;
  curLabel: string;
  prevLabel: string;
}

interface Def {
  hourly: boolean;
  from: Date;
  length: number; // days in the current range
  prevFrom: Date;
  prevLength: number;
  elapsed: number; // days of the current range up to today, inclusive
  step: number; // days per bar
  label: string; // "OCTUBRE 2026"
  vs: string; // "vs Septiembre"
  bar: (i: number, start: Date, prevStart: Date) => Pick<ChartBar, 'title' | 'curLabel' | 'prevLabel'>;
}

function dm(d: Date, thisYear: number) {
  const y = d.getUTCFullYear();
  return `${d.getUTCDate()} ${monthShort(d.getUTCMonth())}${y !== thisYear ? ` ${y}` : ''}`;
}

/** What each quick range covers and what it's compared with. */
export function spanDef(span: Span, weekStart: number): Def {
  const t = todayCR();
  const today = cd(t.y, t.m, t.d);
  const weekly = (from: Date, prevFrom: Date, to: Date, prevTo: Date, label: string, vs: string): Def => ({
    hourly: false,
    from,
    length: daysBetween(from, to),
    prevFrom,
    prevLength: daysBetween(prevFrom, prevTo),
    elapsed: daysBetween(from, today) + 1,
    step: 7,
    label,
    vs,
    bar: (i, s, p) => ({ title: `Semana ${i + 1}`, curLabel: dm(s, t.y), prevLabel: dm(p, t.y) }),
  });
  switch (span) {
    case 'D':
      return {
        hourly: true,
        from: today,
        length: 1,
        prevFrom: addDays(today, -1),
        prevLength: 1,
        elapsed: 1,
        step: 1,
        label: `Hoy · ${t.d} ${monthShort(t.m)}`,
        vs: 'vs ayer',
        bar: (i) => ({ title: `${i}:00`, curLabel: 'Hoy', prevLabel: 'Ayer' }),
      };
    case 'S': {
      const from = addDays(today, -((t.dow - weekStart + 7) % 7));
      return {
        hourly: false,
        from,
        length: 7,
        prevFrom: addDays(from, -7),
        prevLength: 7,
        elapsed: daysBetween(from, today) + 1,
        step: 1,
        label: 'Esta semana',
        vs: 'vs semana pasada',
        bar: (_, s, p) => ({ title: WEEKDAYS[s.getUTCDay()], curLabel: dm(s, t.y), prevLabel: dm(p, t.y) }),
      };
    }
    case '6M':
      return weekly(cd(t.y, t.m - 5, 1), cd(t.y, t.m - 11, 1), cd(t.y, t.m + 1, 1), cd(t.y, t.m - 5, 1), 'Últimos 6 meses', 'vs 6 meses anteriores');
    case '1A':
      return weekly(cd(t.y, t.m - 11, 1), cd(t.y - 1, t.m - 11, 1), cd(t.y, t.m + 1, 1), cd(t.y, t.m - 11, 1), 'Últimos 12 meses', 'vs 12 meses anteriores');
    case 'YTD':
      return weekly(cd(t.y, 0, 1), cd(t.y - 1, 0, 1), cd(t.y + 1, 0, 1), cd(t.y, 0, 1), `${t.y} a la fecha`, `vs ${t.y - 1}`);
    default: {
      const from = cd(t.y, t.m, 1);
      const prevFrom = cd(t.y, t.m - 1, 1);
      const pm = prevFrom.getUTCMonth();
      return {
        hourly: false,
        from,
        length: daysBetween(from, cd(t.y, t.m + 1, 1)),
        prevFrom,
        prevLength: daysBetween(prevFrom, from),
        elapsed: t.d,
        step: 1,
        label: `${cap(monthName(t.m))} ${t.y}`,
        vs: `vs ${cap(monthName(pm))}`,
        bar: (i) => ({ title: `Día ${i + 1}`, curLabel: cap(monthShort(t.m)), prevLabel: cap(monthShort(pm)) }),
      };
    }
  }
}

// daily totals already fetched, per space and range (a session cache; bump() changes `version`)
const cache = new Map<string, Map<string, number>>();

function useDaily(spaceId: string | undefined, from: string, to: string, version: number, skip: boolean) {
  const key = `${spaceId}|${from}|${to}|${version}`;
  const [, force] = useState(0);
  const hit = cache.get(key);
  useEffect(() => {
    if (skip || !spaceId || cache.has(key)) return;
    let alive = true;
    db.rpc<{ day: string; spend: number | string }[]>('daily_spend', { p_space: spaceId, p_from: from, p_to: to })
      .then((rows) => {
        cache.set(key, new Map((rows || []).map((r) => [String(r.day).slice(0, 10), Number(r.spend)])));
        if (alive) force((n) => n + 1);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [key, skip, spaceId, from, to]);
  return skip ? null : hit ?? null;
}

/**
 * Bars, total and comparison for one quick range. Days come from the daily_spend RPC (cheap even for
 * two years); "D" works by hour from the movements Inicio already has (today and yesterday).
 */
export function useSpendSeries(span: Span, opts: { spaceId?: string; weekStart: number; version: number; txs: Tx[] }) {
  const def = useMemo(() => spanDef(span, opts.weekStart), [span, opts.weekStart]);
  const fetchFrom = ymdOf(def.prevFrom);
  const fetchTo = ymdOf(addDays(def.from, def.length));
  const daily = useDaily(opts.spaceId, fetchFrom, fetchTo, opts.version, def.hourly);

  return useMemo(() => {
    if (def.hourly) {
      const nowMs = Date.now();
      const cur = new Array(24).fill(0), prev = new Array(24).fill(0);
      let curTotal = 0, prevTotal = 0;
      const todayKey = ymdOf(def.from), yKey = ymdOf(def.prevFrom);
      for (const x of opts.txs) {
        const v = spend(x);
        if (!v) continue;
        const l = crLocal(x.occurred_at);
        const k = l.toISOString().slice(0, 10);
        const h = l.getUTCHours();
        if (k === todayKey) { cur[h] += v; curTotal += v; }
        else if (k === yKey) {
          prev[h] += v;
          if (new Date(x.occurred_at).getTime() < nowMs - DAY) prevTotal += v;
        }
      }
      const hourNow = crLocal().getUTCHours();
      const bars: ChartBar[] = cur.map((v, i) => ({ value: i > hourNow ? null : v, prev: prev[i], ...def.bar(i, def.from, def.prevFrom) }));
      return { def, bars, total: curTotal, prevTotal, hasPrev: true, ready: true };
    }
    if (!daily) return { def, bars: [] as ChartBar[], total: 0, prevTotal: 0, hasPrev: false, ready: false };
    const at = (start: Date, offset: number, len: number, limit: number) => {
      let s = 0;
      for (let d = offset; d < Math.min(offset + len, limit); d++) s += daily.get(ymdOf(addDays(start, d))) || 0;
      return s;
    };
    const bars: ChartBar[] = [];
    for (let i = 0; i * def.step < def.length; i++) {
      const off = i * def.step;
      const len = Math.min(def.step, def.length - off);
      bars.push({
        value: off >= def.elapsed ? null : at(def.from, off, len, def.elapsed),
        prev: off >= def.prevLength ? null : at(def.prevFrom, off, len, def.prevLength),
        ...def.bar(i, addDays(def.from, off), addDays(def.prevFrom, off)),
      });
    }
    const total = at(def.from, 0, def.elapsed, def.elapsed);
    const prevTotal = at(def.prevFrom, 0, def.elapsed, def.prevLength);
    // only compare when there's data from the start of the previous period
    let hasPrev = false;
    for (const k of daily.keys()) if (k < ymdOf(addDays(def.prevFrom, Math.min(def.prevLength, Math.max(3, Math.ceil(def.prevLength / 8)))))) { hasPrev = true; break; }
    return { def, bars, total, prevTotal, hasPrev, ready: true };
  }, [def, daily, opts.txs]);
}
