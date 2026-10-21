import { useEffect, useMemo, useRef, useState } from 'react';
import { inRange, monthBudget, monthRange, spend, sumSpend, weekRange } from '../lib/calc';
import { cap, crIso, crLocal, dayLabel, money, monthName, monthShort, shortK, todayCR } from '../lib/format';
import { accountColor, byKind } from '../lib/accounts';
import { normWords, photoFor, photoUrl } from '../lib/photos';
import type { Tx } from '../lib/types';
import { go, useApp, useTxs } from '../store';
import { Emo, Icon, Loading, tint } from '../ui';
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
      <button className="icon-btn" onClick={() => shift(-1)} aria-label="Mes anterior">
        <Icon name="chevLeft" />
      </button>
      <span>{cap(monthName(ym[1]))} {ym[0]}</span>
      <button className="icon-btn" onClick={() => shift(1)} aria-label="Mes siguiente" disabled={isCurrent}>
        <Icon name="chevRight" />
      </button>
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

// where each merchant bubble sits in the cluster (from the design): left, top, size
const BUBBLES: [number, number, number][] = [
  [0, 34, 44],
  [47, 4, 32],
  [51, 48, 28],
  [88, 32, 29],
  [15, 0, 22],
];

/** Everything the home summary shows; shared by the phone and desktop homes. */
export function useHomeSummary() {
  const { space, categories, accounts, cur, fx, photos } = useApp();
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
    if (x.kind !== 'expense' || x.occurred_at > nowIso) continue;
    const ph = photoFor(photos, x.merchant, x.raw_merchant);
    const key = ph ? `p:${ph.id}` : normWords(x.merchant || x.raw_merchant || x.id).trim();
    if (seen.has(key)) continue;
    seen.add(key);
    merchants.push({ key, tx: x });
  }

  const peek = accounts.filter((a) => !a.archived).sort(byKind).slice(0, 3);
  const recent = txs.filter((x) => x.occurred_at <= nowIso).slice(0, 14);
  return { space, label, value, negative, delta, vsLabel, cardLabel, cardValue, cardSub, spent, budget, merchants, peek, recent, loading };
}

/** A merchant's face: its photo, or the emoji of its category on the category color. */
export function MerchantFace({ tx, size }: { tx: Tx; size: number }) {
  const { photos, categories } = useApp();
  const ph = photoFor(photos, tx.merchant, tx.raw_merchant);
  const cat = categories.find((c) => c.id === tx.category_id);
  return ph ? <img src={photoUrl(ph)} alt="" /> : <span style={{ fontSize: size * 0.5 }}>{cat?.emoji || '🛍️'}</span>;
}

export function Home({ open, setOpen, goPanel, focus, onSearch }: { open: boolean; setOpen: (v: boolean) => void; goPanel: (i: number) => void; focus: number; onSearch: () => void }) {
  const { categories, cur, fx, photos } = useApp();
  const topRef = useRef<HTMLDivElement>(null);
  const h = useHomeSummary();
  if (!h) return <Loading />;
  const { label, value, negative, delta, vsLabel, cardLabel, cardValue, cardSub, merchants, peek, recent } = h;
  const shown = merchants.slice(0, BUBBLES.length);
  const more = merchants.length - shown.length;

  return (
    <div className="home">
      <div className="home-top">
        <header className="home-bar">
          <ProfileButton />
          <span className="row">
            <button className="kai-chip" onClick={() => openKai()} aria-label="Preguntale a Kai">
              <Icon name="sparkle" size={16} />
              Kai
            </button>
            <button className="icon-btn" onClick={onSearch} aria-label="Buscar movimientos">
              <Icon name="search" size={18} />
            </button>
          </span>
        </header>

        <section className="balance" aria-label="Resumen del mes">
          <span className="balance-label">{label}</span>
          <div className="balance-row">
            <span className={negative ? 'balance-num neg' : 'balance-num'}>{negative ? '−' : ''}{money(value, cur, fx)}</span>
            {delta && (
              <span className={delta.good ? 'balance-delta good' : 'balance-delta bad'} title={`Comparado con el ${vsLabel.slice(4)}`}>
                {delta.text}
              </span>
            )}
          </div>
          {delta && <span className="balance-vs">{vsLabel}</span>}
          <div className="balance-actions">
            <a href="#/agregar" className="pill-btn light"><Icon name="plusCircle" size={16} />Gasto</a>
            <button className="pill-btn" onClick={() => goPanel(0)}><Icon name="chart" size={16} />Análisis</button>
          </div>
        </section>

        {peek.length > 0 && (
          <button className="card-peek" onClick={() => goPanel(2)} aria-label="Ver cuentas">
            {peek.map((a, i) => (
              <span key={a.id} data-acc={a.id} style={{ background: accountColor(a).bg, left: i * 19, zIndex: i }} />
            ))}
          </button>
        )}

        <div ref={topRef} className="spend-card-wrap">
          <button className="spend-card" onClick={() => goPanel(0)} aria-label={`${cardLabel}: ${money(cardValue, cur, fx)}. Ver análisis`}>
            <span className="spend-label">{cardLabel}</span>
            <span className="spend-value">{money(cardValue, cur, fx)}{cardSub && <span className="spend-sub"> {cardSub}</span>}</span>
          </button>
          {shown.length > 0 && (
            <div className="bubbles" aria-hidden="true">
              {shown.map((m, i) => {
                const [l, tp, sz] = BUBBLES[i];
                const ph = photoFor(photos, m.tx.merchant, m.tx.raw_merchant);
                const cat = categories.find((c) => c.id === m.tx.category_id);
                return (
                  <span key={m.key} className="bubble" style={{ left: l, top: tp, width: sz, height: sz, background: ph ? '#fff' : tint(cat?.color) }}>
                    {ph ? <img src={photoUrl(ph)} alt="" /> : <span style={{ fontSize: sz * 0.5 }}>{cat?.emoji || '🛍️'}</span>}
                  </span>
                );
              })}
              {more > 0 && <span className="bubble more" style={{ left: 97, top: 6 }}>+{more > 99 ? 99 : more}</span>}
            </div>
          )}
        </div>
      </div>

      <TxSheet open={open} setOpen={setOpen} recent={recent} topRef={topRef} focus={focus} />
    </div>
  );
}
