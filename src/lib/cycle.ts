import { crIso, crLocal, monthName, monthShort, todayCR } from './format';
import type { Range } from './calc';

/**
 * Budget cycles (PPT-10): a space can start its month on the day it gets paid ("Empezar mes").
 * The starts of the current space live here (loaded by the store) so pure helpers can read them.
 * Without any start, a cycle is the calendar month.
 */
let starts: string[] = []; // 'YYYY-MM-DD', ascending

export function setCycleStarts(list: string[]) {
  starts = [...list].map((s) => s.slice(0, 10)).sort();
}
export const cycleStarts = () => starts;

export interface Cycle extends Range {
  /** 'YYYY-MM-DD' of the first day */
  start: string;
  /** started with "Empezar mes" (false = calendar month) */
  custom: boolean;
  /** "noviembre" for a calendar month, "este mes" for a cycle */
  name: string;
  /** "30 oct" */
  startLabel: string;
  /** days since it started (1 = first day) */
  day: number;
}

const parse = (s: string) => s.split('-').map(Number) as [number, number, number];
const ymd = (y: number, m: number, d: number) => {
  const x = new Date(Date.UTC(y, m, d));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
};
const isoOf = (s: string) => {
  const [y, m, d] = parse(s);
  return crIso(y, m - 1, d);
};
const short = (s: string) => {
  const [, m, d] = parse(s);
  return `${d} ${monthShort(m - 1)}`;
};
const daysFrom = (s: string, t = todayCR()) => {
  const [y, m, d] = parse(s);
  return Math.round((Date.UTC(t.y, t.m, t.d) - Date.UTC(y, m - 1, d)) / 86400000) + 1;
};

/** The cycle `offset` steps from the current one (0 = current, -1 = the one before). */
export function cycleRange(offset = 0): Cycle {
  const t = todayCR();
  const today = ymd(t.y, t.m, t.d);
  const past = starts.filter((s) => s <= today);
  const last = past[past.length - 1];
  // a start older than two months is forgotten: back to the calendar month
  if (!last || last < ymd(t.y, t.m - 2, t.d)) return calendar(t.y, t.m + offset, today);
  let i = past.length - 1 + offset;
  if (i < 0) {
    // before the first start: calendar-like months counted back from it
    const [y, m, d] = parse(past[0]);
    const s = ymd(y, m - 1 + i, d);
    const e = ymd(y, m + i, d);
    return make(s, e, today);
  }
  const s = past[i];
  const next = starts.find((x) => x > s);
  let e: string;
  if (next && next <= today) e = next;
  else {
    const [y, m, d] = parse(s);
    e = ymd(y, m, d); // a month after it started…
    if (e <= today) e = ymd(t.y, t.m, t.d + 1); // …or until today while nobody starts a new one
  }
  return make(s, e, today);
}

function make(s: string, e: string, today: string): Cycle {
  return { from: isoOf(s), to: isoOf(e), start: s, custom: true, name: 'este mes', startLabel: short(s), day: s <= today ? daysFrom(s) : 0 };
}

function calendar(y: number, m: number, today: string): Cycle {
  const s = ymd(y, m, 1), e = ymd(y, m + 1, 1);
  const mm = new Date(Date.UTC(y, m, 1)).getUTCMonth();
  return { from: isoOf(s), to: isoOf(e), start: s, custom: false, name: monthName(mm), startLabel: short(s), day: s <= today ? daysFrom(s) : 0 };
}

/** Days in a cycle. */
export const cycleLength = (c: Range) => Math.round((crLocal(c.to).getTime() - crLocal(c.from).getTime()) / 86400000);

/** Today as 'YYYY-MM-DD' (CR). */
export const todayKey = () => {
  const t = todayCR();
  return ymd(t.y, t.m, t.d);
};
