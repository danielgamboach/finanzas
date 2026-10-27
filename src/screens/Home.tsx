import { useMemo, useRef, useState } from 'react';
import { inRange, monthBudget, monthRange, spend, sumSpend, weekRange } from '../lib/calc';
import { amount, cap, crIso, crLocal, dayLabel, money, monthName, monthShort, shortK, todayCR, unitOf } from '../lib/format';
import { SPANS, useSpendSeries, type Span } from '../lib/spendSeries';
import { byKind } from '../lib/accounts';
import { normWords, txMerchant, txPhoto } from '../lib/merchants';
import type { Tx } from '../lib/types';
import { go, useApp, useTxs } from '../store';
import { Icon, Loading } from '../ui';
import { BalanceSummary, Button, HomeHeader, HomeHeaderButton, KaiButton, SpendChart } from '../ds';
import { TxSheet } from '../ui/TxSheet';
import { ProfileButton } from '../ui/ProfileMenu';
import { openKai } from '../ui/Kai';

export function MonthNav({ ym, setYm }: { ym: [number, number]; setYm: (v: [number, number]) => void }) {
  const t = todayCR();
  const isCurrent = ym[0] === t.y && ym[1] === t.m;
  const shift = (d: number) => {
    const dt = new Date(Date.UTC(ym[0], ym[1] + d, 1));
    setYm([dt.getUTCFullYear(), dt.getUTCMonth()]);
  };
  return (
    <div className="month-nav">
      <Button variant="ghost" size="md" iconOnly onClick={() => shift(-1)} aria-label="Mes anterior"><Icon name="chevLeft" /></Button>
      <span>{cap(monthName(ym[1]))} {ym[0]}</span>
      <Button variant="ghost" size="md" iconOnly onClick={() => shift(1)} aria-label="Mes siguiente" disabled={isCurrent}><Icon name="chevRight" /></Button>
    </div>
  );
}

export function useMonth(): [[number, number], (v: [number, number]) => void] {
  const t = todayCR();
  const [ym, setYm] = useState<[number, number]>([t.y, t.m]);
  return [ym, setYm];
}

export function groupByDay(txs: Tx[]) {
  const out: { label: string; rows: Tx[]; total: number }[] = [];
  for (const t of txs) {
    const label = dayLabel(t.occurred_at);
    let g = out[out.length - 1];
    if (!g || g.label !== label) {
      g = { label, rows: [], total: 0 };
      out.push(g);
    }
    g.rows.push(t);
    g.total += spend(t);
  }
  return out;
}

export function goAdd(tipo: string) {
  go(`/agregar?tipo=${tipo}`);
}

/** Everything the home summary shows; shared by the phone and desktop homes. */
export function useHomeSummary() {
  const { space, categories, accounts, cur, fx, merchants: catalog } = useApp();
  const t = todayCR();
  const month = monthRange(t.y, t.m);
  const prevMonth = monthRange(t.y, t.m - 1);
  const week = weekRange(space?.week_start ?? 5);
  const range = useMemo(() => ({ from: [prevMonth.from, week.from].sort()[0], to: [month.to, week.to].sort()[1] }), [prevMonth.from, week.from, month.to, week.to]);
  const { txs, loading } = useTxs(range);
  if (!space) return null;

  const inMonth = txs.filter((x) => inRange(x, month));
  const spent = sumSpend(inMonth);
  const budget = monthBudget(categories);

  // same day of last month; only when we really have last month's data
  const pl = crLocal(prevMonth.from);
  const py = pl.getUTCFullYear(), pm = pl.getUTCMonth();
  const prevDays = new Date(Date.UTC(py, pm + 1, 0)).getUTCDate();
  const prevTxs = txs.filter((x) => inRange(x, prevMonth));
  const hasPrev = prevTxs.some((x) => x.occurred_at < crIso(py, pm, 4));
  const prevSoFar = sumSpend(prevTxs.filter((x) => x.occurred_at < crIso(py, pm, Math.min(t.d, prevDays) + 1)));

  const shared = space.kind === 'shared';
  let label: string, value: number, negative = false;
  let delta: { text: string; good: boolean } | null = null;
  if (budget > 0) {
    const avail = budget - spent;
    value = Math.abs(avail);
    negative = avail < 0;
    label = negative ? (shared ? 'Se pasaron del presupuesto' : 'Te pasaste del presupuesto') : `Disponible en ${monthName(t.m)}`;
    if (hasPrev) {
      const prevAvail = budget - prevSoFar;
      const good = avail >= prevAvail;
      if (prevAvail > 0) {
        const pct = Math.round(((avail - prevAvail) / prevAvail) * 100);
        delta = { text: `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)}%`, good };
      } else delta = { text: `${avail >= prevAvail ? '+' : '−'}${shortK(Math.abs(avail - prevAvail), cur, fx)}`, good };
    }
  } else {
    // no budget yet: what matters is how much has gone out
    value = spent;
    label = `Gastado en ${monthName(t.m)}`;
    if (hasPrev && prevSoFar > 0) {
      const pct = Math.round(((spent - prevSoFar) / prevSoFar) * 100);
      delta = { text: `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)}%`, good: spent <= prevSoFar };
    }
  }
  const vsLabel = `vs. ${Math.min(t.d, prevDays)} ${monthShort(pm)}`;

  // the summary card: month spend (or this week's when the big number already is the month)
  const weekSpent = sumSpend(txs.filter((x) => inRange(x, week)));
  const cardLabel = budget > 0 ? `Gastado en ${monthName(t.m)}` : 'Esta semana';
  const cardValue = budget > 0 ? spent : weekSpent;
  const cardSub = budget > 0 ? `de ${money(budget, cur, fx)}` : null;

  // latest merchants as bubbles: photo when there is one, the category emoji otherwise
  const nowIso = new Date().toISOString();
  const seen = new Set<string>();
  const merchants: { key: string; tx: Tx }[] = [];
  for (const x of inMonth) {
    if (x.kind !== 'expense' || x.hold === 'void' || x.occurred_at > nowIso) continue;
    const mm = txMerchant(catalog, x);
    const key = mm ? `m:${mm.id}` : normWords(x.merchant || x.raw_merchant || x.id).trim();
    if (seen.has(key)) continue;
    seen.add(key);
    merchants.push({ key, tx: x });
  }

  const peek = accounts.filter((a) => !a.archived).sort(byKind).slice(0, 3);
  const recent = txs.filter((x) => x.occurred_at <= nowIso).slice(0, 14);
  return { space, label, value, negative, delta, vsLabel, cardLabel, cardValue, cardSub, spent, budget, merchants, peek, recent, loading, txs };
}

type HomeSummary = NonNullable<ReturnType<typeof useHomeSummary>>;

function readSpan(): Span {
  try {
    const v = localStorage.getItem('finanzas.home.span') as Span | null;
    return v && SPANS.some((s) => s.value === v) ? v : 'M';
  } catch {
    return 'M';
  }
}

/**
 * The top of Inicio (phone and desktop): what went out in the chosen range, the change against the
 * previous one, what's left of the month's budget, and the bars with the quick ranges (D S M 6M 1A YTD).
 */
export function SpendOverview({ h }: { h: HomeSummary }) {
  const { cur, fx, version } = useApp();
  const [span, setSpanState] = useState<Span>(readSpan);
  const setSpan = (v: Span) => {
    setSpanState(v);
    try {
      localStorage.setItem('finanzas.home.span', v);
    } catch {
      /* storage unavailable */
    }
  };
  const s = useSpendSeries(span, { spaceId: h.space.id, weekStart: h.space.week_start ?? 5, version, txs: h.txs });
  // keep the last numbers on screen while a new range loads
  const last = useRef<{ span: Span; s: typeof s } | null>(null);
  if (s.ready) last.current = { span, s };
  const shown = s.ready ? s : last.current?.s ?? null;
  const unit = unitOf(cur);
  const total = shown ? shown.total : span === 'M' ? h.spent : 0;

  let delta = null;
  if (s.ready && s.hasPrev && s.prevTotal > 0) {
    const pct = Math.round(((s.total - s.prevTotal) / s.prevTotal) * 100);
    delta = {
      value: `${Math.abs(pct)}%`,
      good: s.total <= s.prevTotal,
      direction: pct < 0 ? ('down' as const) : pct > 0 ? ('up' as const) : undefined,
      vs: s.def.vs,
      title: `Gastado: ${amount(s.total, cur, fx)} ${unit}. Antes, a esta altura: ${amount(s.prevTotal, cur, fx)} ${unit}`,
    };
  }
  const avail = h.budget - h.spent;
  const available = h.budget > 0 ? { value: amount(avail, cur, fx, { sign: avail < 0 ? '−' : '' }), unit, negative: avail < 0 } : null;

  return (
    <>
      <BalanceSummary label={s.def.label} value={amount(total, cur, fx)} unit={unit} delta={delta} available={available} />
      <SpendChart
        bars={shown?.bars ?? []}
        format={(n) => amount(n, cur, fx)}
        unit={unit}
        ranges={SPANS.map((x) => ({ value: x.value, label: x.label, ariaLabel: x.aria }))}
        range={span}
        onRange={setSpan}
        label={`Gasto, ${s.def.label}`}
      />
    </>
  );
}

/** A merchant's face: its photo, or the emoji of its category on the category color. */
export function MerchantFace({ tx, size }: { tx: Tx; size: number }) {
  const { merchants, categories } = useApp();
  const ph = txPhoto(merchants, tx);
  const cat = categories.find((c) => c.id === tx.category_id);
  return ph ? <img src={ph} alt="" /> : <span style={{ fontSize: size * 0.5 }}>{cat?.emoji || '🛍️'}</span>;
}

export function Home({ open, setOpen, focus }: { open: boolean; setOpen: (v: boolean) => void; goPanel: (i: number) => void; focus: number; onSearch?: () => void }) {
  const topRef = useRef<HTMLDivElement>(null);
  const h = useHomeSummary();
  if (!h) return <Loading />;

  return (
    <div className="home">
      <div className="home-top">
        <HomeHeader actions={<><HomeHeaderButton icon="plus" label="Agregar gasto" href="#/agregar" /><KaiButton onClick={() => openKai()} /></>}>
          <ProfileButton />
        </HomeHeader>
        <div ref={topRef} className="home-summary">
          <SpendOverview h={h} />
        </div>
      </div>

      <TxSheet open={open} setOpen={setOpen} recent={h.recent} topRef={topRef} focus={focus} />
    </div>
  );
}
