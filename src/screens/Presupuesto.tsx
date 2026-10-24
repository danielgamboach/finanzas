import { useMemo, useState } from 'react';
import { categoryStats, cumulative, inRange, monthBudget, monthRange, spend, sumSpend, weekRange, type CatStat } from '../lib/calc';
import { rootId } from '../lib/cats';
import { cap, crIso, crLocal, money, monthName, monthShort, shortK, todayCR } from '../lib/format';
import { useApp, useTxs } from '../store';
import { Emo, Icon, Loading, Segmented } from '../ui';
import { MonthChart } from '../ui/MonthChart';
import { AiNote, fingerprint } from '../ui/AiNote';
import { dateKey } from '../lib/format';
import { MonthNav, useMonth } from './Home';
import { useDesktop } from '../lib/useDesktop';
import { txBadge, txMerchant, photoUrl } from '../lib/merchants';

/** Left panel: the month at a glance, budgets by category and trends. */
export function Analisis() {
  const { space, categories, cur, fx } = useApp();
  const [tab, setTab] = useState<'limits' | 'analysis'>('limits');
  const [ym, setYm] = useMonth();
  const desk = useDesktop();
  const t = todayCR();
  const isCurrent = ym[0] === t.y && ym[1] === t.m;
  const month = monthRange(ym[0], ym[1]);
  const week = weekRange(space?.week_start ?? 5);
  // six months back for the analysis, plus the current week
  const range = useMemo(() => ({ from: crIso(ym[0], ym[1] - 5, 1), to: [month.to, week.to].sort()[1] }), [ym, month.to, week.to]);
  const { txs, loading } = useTxs(range);
  // the AI always talks about the current month and week
  const nowMonth = monthRange(t.y, t.m);

  if (!space) return <Loading />;
  const fp = fingerprint(txs.filter((x) => inRange(x, nowMonth) || inRange(x, week)), categories, dateKey(new Date().toISOString()));
  const stats = categoryStats(categories, txs, month, week, isCurrent);
  const inMonth = txs.filter((x) => inRange(x, month));
  const spent = sumSpend(inMonth);
  const budget = stats.reduce((a, s) => a + (s.cat.limit_amount ? (s.cat.limit_period === 'weekly' ? Number(s.cat.limit_amount) * 4.33 : Number(s.cat.limit_amount)) : 0), 0);
  const l = crLocal(month.from);
  const daysInMonth = new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth() + 1, 0)).getUTCDate();

  // month chart: this month (up to today) against the previous one
  const pr = monthRange(ym[0], ym[1] - 1);
  const pl = crLocal(pr.from);
  const prevDays = new Date(Date.UTC(pl.getUTCFullYear(), pl.getUTCMonth() + 1, 0)).getUTCDate();
  const prevTxs = txs.filter((x) => inRange(x, pr));
  const curSeries = cumulative(inMonth, l.getUTCFullYear(), l.getUTCMonth(), isCurrent ? t.d : daysInMonth);
  const prevSeries = prevTxs.length ? cumulative(prevTxs, pl.getUTCFullYear(), pl.getUTCMonth(), prevDays) : null;
  const dayN = isCurrent ? t.d : daysInMonth;
  const prevSoFar = prevSeries ? prevSeries[Math.min(dayN, prevDays) - 1] : 0;
  const diff = spent - prevSoFar;
  const fmt = (v: number) => money(v, cur, fx);

  const ai = <AiNote spaceId={space.id} fp={fp} ready={!loading && isCurrent} />;
  const chart = (
    <section className="card pad month-card" aria-label={`Gasto de ${monthName(ym[1])}`}>
      <span className="row gap8 baseline wrap">
        <strong className="stat-hero">{fmt(spent)}</strong>
        {budget > 0 && <span className="muted">de {fmt(budget)}</span>}
      </span>
      <MonthChart current={curSeries} previous={prevSeries} days={daysInMonth} budget={budget} curLabel={cap(monthName(ym[1]))} prevLabel={cap(monthName(pl.getUTCMonth()))} fmt={fmt} />
      {prevSeries && (
        <span className="month-cmp">
          <span className={diff > 0 ? 'up' : 'down'}>{diff > 0 ? '↑' : '↓'} {fmt(Math.abs(diff))}</span>
          {' '}{diff > 0 ? 'más' : 'menos'} que {monthName(pl.getUTCMonth())}{isCurrent ? ' a esta altura' : ''}
        </span>
      )}
    </section>
  );
  const limits = (
    <>
      <div className="section-head">
        <h2 className="h2">Categorías</h2>
        <a href="#/categoria/nueva" className="link">Nueva</a>
      </div>
      <div className="col gap8 cat-list">
        {stats.map((s) => <CatRow key={s.cat.id} s={s} />)}
      </div>
    </>
  );

  if (desk) {
    // desktop: everything at once, budget on the left and trends on the right
    return (
      <div className="dpage">
        <header className="dpage-head">
          <h1 className="dtitle">Análisis</h1>
          <MonthNav ym={ym} setYm={setYm} />
        </header>
        {loading && txs.length === 0 ? (
          <Loading />
        ) : (
          <div className="dgrid analisis-grid">
            <div className="dcol">
              {ai}
              {chart}
              {limits}
            </div>
            <div className="dcol">
              <h2 className="h2 px4">Tendencias</h2>
              <Analysis txs={txs} ym={ym} />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="panel-inner">
      <header className="panel-head">
        <h1 className="h1">Análisis</h1>
        <MonthNav ym={ym} setYm={setYm} />
      </header>
      {ai}
      {chart}
      <Segmented value={tab} options={[['limits', 'Presupuesto'], ['analysis', 'Tendencias']]} onChange={setTab} dark />
      {loading && txs.length === 0 ? <Loading /> : tab === 'limits' ? limits : <Analysis txs={txs} ym={ym} />}
    </div>
  );
}

/** A budget row; parents with subcategories get an expandable breakdown. */
function CatRow({ s }: { s: CatStat }) {
  const { cur, fx } = useApp();
  const [open, setOpen] = useState(false);
  const over = s.projection !== null && s.limit !== null && s.projection > s.limit;
  const bar = s.cat.is_fixed ? 'var(--muted)' : s.level === 'over' ? 'var(--danger)' : s.level === 'warn' ? 'var(--warn)' : 'var(--ink)';
  const subs = s.subs.filter((x) => x.spent !== 0 || !x.direct);
  const kids = s.subs.filter((x) => !x.direct).length;
  return (
    <div className="card cat-card">
      <a href={`#/categoria/${s.cat.id}`} className="cat-row">
        <Emo e={s.cat.emoji} color={s.cat.color} />
        <span className="grow col gap6">
          <span className="row gap6">
            <strong>{s.cat.name}</strong>
            <span className={`ml-auto pct lvl-${s.level}`}>{s.pct !== null ? (s.cat.is_fixed && s.pct >= 100 ? '✅ Pagado' : `${s.pct}%`) : ''}</span>
          </span>
          {s.limit ? (
            <span className="bar"><span className="bar-fill" style={{ width: `${Math.min(s.pct || 0, 100)}%`, background: bar }} /></span>
          ) : null}
          <span className="strong-sm">
            {money(s.spent, cur, fx)}
            {s.limit ? <span className="muted"> de {money(s.limit, cur, fx)}</span> : null}
          </span>
          {over && <span className="small danger">Va a cerrar en {money(s.projection!, cur, fx)}</span>}
        </span>
        <Icon name="chevRight" size={18} />
      </a>
      {kids > 0 && (
        <>
          <button className="sub-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
            <span>{open ? 'Ocultar' : `${kids} ${kids === 1 ? 'subcategoría' : 'subcategorías'}`}</span>
            <Icon name={open ? 'chevUp' : 'chevDown'} size={16} />
          </button>
          {open && (
            <div className="sub-list">
              {subs.map((x) => {
                const pct = s.spent > 0 ? Math.max(0, Math.round((x.spent / s.spent) * 100)) : 0;
                return (
                  <a key={x.cat.id + (x.direct ? '-d' : '')} href={`#/categoria/${s.cat.id}?sub=${x.direct ? 'none' : x.cat.id}`} className="sub-row">
                    <span className="sub-emo" aria-hidden="true">{x.direct ? '•' : x.cat.emoji}</span>
                    <span className="grow col gap4">
                      <span className="row between">
                        <span className="sm">{x.direct ? 'Sin detalle' : x.cat.name}</span>
                        <strong className="sm">{money(x.spent, cur, fx)}</strong>
                      </span>
                      <span className="bar thin"><span className="bar-fill" style={{ width: `${Math.min(pct, 100)}%`, background: 'var(--muted)' }} /></span>
                    </span>
                  </a>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Analysis({ txs, ym }: { txs: ReturnType<typeof useTxs>['txs']; ym: [number, number] }) {
  const { categories, cur, fx, merchants } = useApp();
  const [topBy, setTopBy] = useState<'amt' | 'n'>(() => {
    try {
      return localStorage.getItem('finanzas.topBy') === 'n' ? 'n' : 'amt';
    } catch {
      return 'amt';
    }
  });
  const pickTop = (v: 'amt' | 'n') => {
    setTopBy(v);
    try {
      localStorage.setItem('finanzas.topBy', v);
    } catch {
      /* storage unavailable */
    }
  };
  const t = todayCR();
  const isCurrent = ym[0] === t.y && ym[1] === t.m;
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(ym[0], ym[1] - 5 + i, 1));
    const r = monthRange(d.getUTCFullYear(), d.getUTCMonth());
    return { m: d.getUTCMonth(), total: sumSpend(txs.filter((x) => inRange(x, r))) };
  });
  const budget = monthBudget(categories);
  const max = Math.max(budget * 1.1, ...months.map((m) => m.total), 1);

  // same period comparison
  const day = isCurrent ? t.d : 31;
  const curR = { from: crIso(ym[0], ym[1], 1), to: isCurrent ? crIso(ym[0], ym[1], day + 1) : crIso(ym[0], ym[1] + 1, 1) };
  const prevR = { from: crIso(ym[0], ym[1] - 1, 1), to: isCurrent ? crIso(ym[0], ym[1] - 1, day + 1) : crIso(ym[0], ym[1], 1) };
  const cmp = categories
    .filter((c) => c.kind === 'expense' && !c.parent_id)
    .map((c) => {
      const mine = txs.filter((x) => rootId(categories, x.category_id) === c.id);
      const a = sumSpend(mine.filter((x) => inRange(x, prevR)));
      const b = sumSpend(mine.filter((x) => inRange(x, curR)));
      return { c, a, b, d: a > 0 ? Math.round(((b - a) / a) * 100) : null };
    })
    .filter((x) => x.a > 0 || x.b > 0)
    .sort((x, y) => y.b - x.b)
    .slice(0, 8);

  const month = monthRange(ym[0], ym[1]);
  const inMonth = txs.filter((x) => inRange(x, month));

  // a catalog merchant groups all its branches ("ampm Freses", "AM PM Pavas"…)
  const shops = new Map<string, { n: number; amt: number; cat?: string; photo: string | null; badge: string | null }>();
  inMonth.filter((x) => x.kind === 'expense').forEach((x) => {
    const m = txMerchant(merchants, x);
    const k = m ? m.name : x.merchant || 'Sin nombre';
    const s = shops.get(k) || { n: 0, amt: 0, cat: x.category_id || undefined, photo: m ? photoUrl(m) : null, badge: txBadge(merchants, x) };
    s.n += 1;
    s.amt += spend(x);
    shops.set(k, s);
  });
  const top = [...shops.entries()]
    .sort((a, b) => (topBy === 'n' ? b[1].n - a[1].n || b[1].amt - a[1].amt : b[1].amt - a[1].amt))
    .slice(0, 5);

  return (
    <>
      <section className="card pad col gap14">
        <h2 className="h3">Gasto por mes</h2>
        <div className="month-bars" role="img" aria-label={`Gasto de los últimos 6 meses: ${months.map((m) => `${monthShort(m.m)} ${shortK(m.total, cur, fx)}`).join(', ')}`}>
          {months.map((m, i) => {
            const over = budget > 0 && m.total > budget;
            const last = i === months.length - 1;
            return (
              <div key={i} className="mb-col">
                <div className="mb-area">
                  <div className="mb-fill" style={{ height: `${(m.total / max) * 100}%`, background: last ? '#FFDF20' : over ? '#FF8A7A' : '#525252' }} />
                  {budget > 0 && <div className="mb-budget" style={{ height: `${(budget / max) * 100}%` }} />}
                  <span className={last || over ? 'mb-val on-light' : 'mb-val'}>{shortK(m.total, cur, fx).replace(/^[¢$]/, '')}</span>
                </div>
                <span className="mb-label">{monthShort(m.m)}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card pad col gap14">
        <div className="col">
          <h2 className="h3">{monthName(ym[1]).replace(/^./, (c) => c.toUpperCase())} vs. {monthName((ym[1] + 11) % 12)}</h2>
          {isCurrent && <span className="muted small">Del 1 al {day}</span>}
        </div>
        {cmp.length === 0 ? (
          <span className="muted">Todavía no hay datos para comparar.</span>
        ) : (
          cmp.map((x) => (
            <div key={x.c.id} className="row gap12">
              <Emo e={x.c.emoji} color={x.c.color} size={40} />
              <span className="grow col">
                <strong className="sm">{x.c.name}</strong>
                <span className="muted small">{money(x.a, cur, fx)} → {money(x.b, cur, fx)}</span>
              </span>
              {x.d !== null && (
                <span className={x.d > 0 ? 'delta up' : 'delta down'}>{x.d > 0 ? '↑' : x.d < 0 ? '↓' : ''} {Math.abs(x.d)}%</span>
              )}
            </div>
          ))
        )}
      </section>

      <section className="card list">
        <div className="row between pad-top top-head">
          <h2 className="h3">Top comercios</h2>
          <div className="mini-seg" role="radiogroup" aria-label="Ordenar comercios">
            {([['amt', 'Por monto'], ['n', 'Por compras']] as const).map(([v, label]) => (
              <button key={v} role="radio" aria-checked={topBy === v} className={topBy === v ? 'on' : ''} onClick={() => pickTop(v)}>{label}</button>
            ))}
          </div>
        </div>
        {top.length === 0 ? (
          <span className="empty">Sin gastos este mes.</span>
        ) : (
          top.map(([name, s], i) => {
            const c = categories.find((x) => x.id === s.cat);
            return (
              <div key={name} className="row gap12 list-row">
                <span className="rank">{i + 1}</span>
                <Emo e={c?.emoji || '🛍️'} color={c?.color} size={40} img={s.photo} badge={s.badge} />
                <span className="grow col">
                  <strong className="sm">{name}</strong>
                  <span className="muted small">
                    {topBy === 'n' ? money(s.amt, cur, fx) : `${s.n} ${s.n === 1 ? 'compra' : 'compras'}`}{c ? ` · ${c.name}` : ''}
                  </span>
                </span>
                <strong className="sm">{topBy === 'n' ? `${s.n} ${s.n === 1 ? 'compra' : 'compras'}` : money(s.amt, cur, fx)}</strong>
              </div>
            );
          })
        )}
      </section>
    </>
  );
}
