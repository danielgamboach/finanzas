import { useEffect, useMemo, useState } from 'react';
import { db } from './api';
import { spend } from './calc';
import { cap, crLocal, monthName, monthShort, todayCR } from './format';
import type { Tx } from './types';

/** The ranges of the Inicio chart, as the wheel shows them. */
export type Span = 'D' | 'S' | 'M' | '6M' | '1A' | 'YTD';
export const SPANS: { value: Span; label: string; aria: string }[] = [
  { value: 'D', label: 'Día', aria: 'Hoy' },
  { value: 'S', label: 'Semana', aria: 'Esta semana' },
  { value: 'M', label: 'Mes', aria: 'Este mes' },
  { value: '6M', label: 'Semestre', aria: 'Últimos 6 meses' },
  { value: '1A', label: 'Año', aria: 'Último año' },
];
/** Still computed (old saved choice, other screens), no longer offered on the wheel. */
export const YTD_SPAN: Span = 'YTD';

const DAY = 86400000;
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

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
  /** A second, quieter line under the title: the hours a bar covers. */
  sub?: string;
  curLabel: string;
  prevLabel: string;
}

interface Def {
  /** Minutes per bar when the bars are finer than a day (built from the movements on hand). */
  fine: number | null;
  from: Date;
  length: number; // days in the current range
  prevFrom: Date;
  prevLength: number;
  elapsed: number; // days of the current range up to today, inclusive
  step: number; // days per bar
  label: string; // "OCTUBRE 2026"
  vs: string; // "vs Septiembre"
  /** Labels under both ends of the chart. */
  ends: [string, string];
  /** start and prevStart are CR wall-clock instants (UTC getters). */
  bar: (i: number, start: Date, prevStart: Date) => Pick<ChartBar, 'title' | 'sub' | 'curLabel' | 'prevLabel'>;
}

function dm(d: Date, thisYear: number) {
  const y = d.getUTCFullYear();
  return `${d.getUTCDate()} ${monthShort(d.getUTCMonth())}${y !== thisYear ? ` ${y}` : ''}`;
}
/** "Martes 27 oct" */
const longDay = (d: Date, y: number) => `${cap(WEEKDAYS[d.getUTCDay()])} ${dm(d, y)}`;
/** "Mar 20 oct" */
const shortDay = (d: Date, y: number) => `${cap(DOW[d.getUTCDay()])} ${dm(d, y)}`;
const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
const PARTS = ['Madrugada', 'Mañana', 'Tarde', 'Noche'];

/** What each quick range covers and what it's compared with. */
export function spanDef(span: Span, weekStart: number): Def {
  const t = todayCR();
  const today = cd(t.y, t.m, t.d);
  const weekly = (from: Date, prevFrom: Date, to: Date, prevTo: Date, label: string, vs: string): Def => ({
    fine: null,
    from,
    length: daysBetween(from, to),
    prevFrom,
    prevLength: daysBetween(prevFrom, prevTo),
    elapsed: daysBetween(from, today) + 1,
    step: 7,
    label,
    vs,
    ends: [cap(monthShort(from.getUTCMonth())), cap(monthShort(addDays(to, -1).getUTCMonth()))],
    bar: (i, s, p) => {
      const e = addDays(s, 6);
      const range = s.getUTCMonth() === e.getUTCMonth() ? `${s.getUTCDate()} al ${dm(e, t.y)}` : `${dm(s, t.y)} al ${dm(e, t.y)}`;
      return { title: `Semana del ${range}`, curLabel: dm(s, t.y), prevLabel: dm(p, t.y) };
    },
  });
  switch (span) {
    case 'D':
      return {
        fine: 30,
        from: today,
        length: 1,
        prevFrom: addDays(today, -1),
        prevLength: 1,
        elapsed: 1,
        step: 1,
        label: `Hoy · ${t.d} ${monthShort(t.m)}`,
        vs: 'vs ayer',
        ends: ['0:00', '24:00'],
        bar: (_, s) => {
          const m = s.getUTCHours() * 60 + s.getUTCMinutes();
          return { title: `Hoy, ${longDay(s, t.y).toLowerCase()}`, sub: `${hm(m)} a ${hm(m + 30)}`, curLabel: 'Hoy', prevLabel: 'Ayer' };
        },
      };
    case 'S': {
      const from = addDays(today, -((t.dow - weekStart + 7) % 7));
      return {
        fine: 360,
        from,
        length: 7,
        prevFrom: addDays(from, -7),
        prevLength: 7,
        elapsed: daysBetween(from, today) + 1,
        step: 1,
        label: 'Esta semana',
        vs: 'vs semana pasada',
        ends: [cap(DOW[from.getUTCDay()]), cap(DOW[addDays(from, 6).getUTCDay()])],
        bar: (_, s, p) => {
          const h = s.getUTCHours();
          return { title: longDay(s, t.y), sub: `${PARTS[h / 6]} · ${h}:00 a ${h + 6}:00`, curLabel: 'Esta semana', prevLabel: shortDay(p, t.y) };
        },
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
      const length = daysBetween(from, cd(t.y, t.m + 1, 1));
      return {
        fine: null,
        from,
        length,
        prevFrom,
        prevLength: daysBetween(prevFrom, from),
        elapsed: t.d,
        step: 1,
        label: `${cap(monthName(t.m))} ${t.y}`,
        vs: `vs ${cap(monthName(pm))}`,
        ends: [`1 ${monthShort(t.m)}`, `${length} ${monthShort(t.m)}`],
        bar: (_, s, p) => ({ title: longDay(s, t.y), curLabel: 'Este mes', prevLabel: shortDay(p, t.y) }),
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
 * two years); "D" (every 30 min) and "S" (every 6 h) work from the movements Inicio already has,
 * which reach back to the start of last month.
 */
export function useSpendSeries(span: Span, opts: { spaceId?: string; weekStart: number; version: number; txs: Tx[] }) {
  const def = useMemo(() => spanDef(span, opts.weekStart), [span, opts.weekStart]);
  const fetchFrom = ymdOf(def.prevFrom);
  const fetchTo = ymdOf(addDays(def.from, def.length));
  const daily = useDaily(opts.spaceId, fetchFrom, fetchTo, opts.version, def.fine !== null);

  return useMemo(() => {
    if (def.fine !== null) {
      const slot = def.fine * 60000;
      const n = Math.round((def.length * DAY) / slot);
      const cur = new Array(n).fill(0), prev = new Array(n).fill(0);
      // the dates are CR wall-clock at UTC midnight, so compare against CR-local instants
      const start = def.from.getTime(), pStart = def.prevFrom.getTime();
      const now = crLocal().getTime();
      const elapsed = now - start; // how far into the current range we are
      let curTotal = 0, prevTotal = 0;
      for (const x of opts.txs) {
        const v = spend(x);
        if (!v) continue;
        const at = crLocal(x.occurred_at).getTime();
        if (at >= start && at < start + n * slot) {
          cur[Math.floor((at - start) / slot)] += v;
          if (at <= now) curTotal += v;
        } else if (at >= pStart && at < pStart + n * slot) {
          prev[Math.floor((at - pStart) / slot)] += v;
          if (at - pStart <= elapsed) prevTotal += v;
        }
      }
      const bars: ChartBar[] = cur.map((v, i) => ({
        value: i * slot > elapsed ? null : v,
        prev: prev[i],
        ...def.bar(i, new Date(start + i * slot), new Date(pStart + i * slot)),
      }));
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
