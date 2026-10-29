import { useMemo, useState } from 'react';
import { BalanceSummary, ChartSkeleton, Delta, GroupSkeleton, ListGroup, ListRow, Loader, PageHeader, Progress, Segmented, SummarySkeleton } from '../ds';
import { PageSkeleton } from '../ui/Skeletons';
import { categoryStats, cumulative, inRange, monthBudget, monthRange, spend, sumSpend, weekRange, type CatStat } from '../lib/calc';
import { rootId } from '../lib/cats';
import { amount, cap, crIso, crLocal, money, monthName, monthShort, shortK, todayCR, unitOf } from '../lib/format';
import { useApp, useTxs } from '../store';
import { Emo, Loading } from '../ui';
import { MonthChart } from '../ui/MonthChart';
import { AiNote, fingerprint } from '../ui/AiNote';
import { dateKey } from '../lib/format';
import { MonthNav, useMonth } from './Home';
import { useDesktop } from '../lib/useDesktop';
import { useMenu } from '../lib/menu';
import { txBadge, txMerchant, photoUrl } from '../lib/merchants';

/** Everything both pages compute for the chosen month (six months back for the trends, plus this week). */
function useMonthData(ym: [number, number]) {
  const { space, categories } = useApp();
  const t = todayCR();
  const isCurrent = ym[0] === t.y && ym[1] === t.m;
  const month = monthRange(ym[0], ym[1]);
  const week = weekRange(space?.week_start ?? 5);
  const range = useMemo(() => ({ from: crIso(ym[0], ym[1] - 5, 1), to: [month.to, week.to].sort()[1] }), [ym, month.to, week.to]);
  const { txs, loading } = useTxs(range);
  const stats = categoryStats(categories, txs, month, week, isCurrent);
  const inMonth = txs.filter((x) => inRange(x, month));
  const spent = sumSpend(inMonth);
  const budget = stats.reduce((a, s) => a + (s.cat.limit_amount ? (s.cat.limit_period === 'weekly' ? Number(s.cat.limit_amount) * 4.33 : Number(s.cat.limit_amount)) : 0), 0);
  const l = crLocal(month.from);
  const daysInMonth = new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth() + 1, 0)).getUTCDate();
  const pr = monthRange(ym[0], ym[1] - 1);
  const pl = crLocal(pr.from);
  const prevDays = new Date(Date.UTC(pl.getUTCFullYear(), pl.getUTCMonth() + 1, 0)).getUTCDate();
  const prevTxs = txs.filter((x) => inRange(x, pr));
  const curSeries = cumulative(inMonth, l.getUTCFullYear(), l.getUTCMonth(), isCurrent ? t.d : daysInMonth);
  const prevSeries = prevTxs.length ? cumulative(prevTxs, pl.getUTCFullYear(), pl.getUTCMonth(), prevDays) : null;
  const dayN = isCurrent ? t.d : daysInMonth;
  const prevSoFar = prevSeries ? prevSeries[Math.min(dayN, prevDays) - 1] : 0;
  return { txs, loading, first: loading && txs.length === 0, isCurrent, week, stats, spent, budget, daysInMonth, curSeries, prevSeries, prevSoFar, prevName: monthName(pl.getUTCMonth()) };
}

/**
 * Presupuesto (menu, route #/categorias): the month's spending against the budget and every category with its bar.
 * The breakdown by subcategory lives in each category.
 */
export function Categorias() {
  const { space, cur, fx } = useApp();
  const [ym, setYm] = useMonth();
  const desk = useDesktop();
  const menu = useMenu();
  const d = useMonthData(ym);
  if (!space) return <PageSkeleton title="Presupuesto"><GroupSkeleton rows={5} below /></PageSkeleton>;

  const diff = d.spent - d.prevSoFar;
  const summary = (
    <BalanceSummary
      label={`Gasto de ${monthName(ym[1])}`}
      value={amount(d.spent, cur, fx)}
      unit={unitOf(cur)}
      delta={d.prevSeries && Math.abs(diff) >= 1 ? { value: `${amount(Math.abs(diff), cur, fx)} ${unitOf(cur)}`, good: diff <= 0, direction: diff > 0 ? 'up' : 'down', vs: `${diff > 0 ? 'más' : 'menos'} que ${d.prevName}${d.isCurrent ? ' a esta altura' : ''}` } : null}
      meta={d.budget > 0 ? `de ${amount(d.budget, cur, fx)} ${unitOf(cur)} de presupuesto` : null}
    />
  );
  const limits = (
    <ListGroup title="Categorías" action={<a href="#/categoria/nueva">Nueva</a>}>
      {d.stats.map((s) => <CatRow key={s.cat.id} s={s} />)}
    </ListGroup>
  );

  if (desk) {
    return (
      <div className="dpage">
        <header className="dpage-head">
          <h1 className="dtitle">Presupuesto</h1>
          <MonthNav ym={ym} setYm={setYm} />
        </header>
        {d.first ? (
          <Loader><div className="dcol gap24 dnarrow"><SummarySkeleton /><GroupSkeleton rows={6} below /></div></Loader>
        ) : (
          <div className="dcol gap24 dnarrow">
            {summary}
            {limits}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader title="Presupuesto" onMenu={menu?.open} actions={<MonthNav ym={ym} setYm={setYm} />} />
      <div className="page-hero">{d.first ? <Loader><SummarySkeleton /></Loader> : summary}</div>
      <div className="page-body">{d.first ? <Loader><GroupSkeleton rows={5} below /></Loader> : limits}</div>
    </div>
  );
}

/**
 * Mis finanzas (menu, route #/tendencias): how the month is going against the last one (the cumulative chart and the AI note),
 * spending per month, category by category against last month and the top merchants.
 */
export function Tendencias() {
  const { space, categories, cur, fx } = useApp();
  const [ym, setYm] = useMonth();
  const desk = useDesktop();
  const menu = useMenu();
  const d = useMonthData(ym);
  if (!space) return <PageSkeleton title="Mis finanzas" hero={false}><ChartSkeleton height={120} /><GroupSkeleton rows={4} /></PageSkeleton>;

  // the AI always talks about the current month and week
  const t = todayCR();
  const nowMonth = monthRange(t.y, t.m);
  const fp = fingerprint(d.txs.filter((x) => inRange(x, nowMonth) || inRange(x, d.week)), categories, dateKey(new Date().toISOString()));
  const ai = <AiNote spaceId={space.id} fp={fp} ready={!d.loading && d.isCurrent} />;
  const fmt = (v: number) => money(v, cur, fx);
  const chart = d.first ? <Loader><ChartSkeleton height={120} /></Loader> : (
    <section className="month-card" aria-label={`Gasto de ${monthName(ym[1])} contra ${d.prevName}`}>
      <MonthChart current={d.curSeries} previous={d.prevSeries} days={d.daysInMonth} budget={d.budget} curLabel={cap(monthName(ym[1]))} prevLabel={cap(d.prevName)} fmt={fmt} />
    </section>
  );
  const groups = d.first ? <Loader><GroupSkeleton rows={1} leading="none" value={false} /><GroupSkeleton rows={4} /></Loader> : <Analysis txs={d.txs} ym={ym} />;

  if (desk) {
    return (
      <div className="dpage">
        <header className="dpage-head">
          <h1 className="dtitle">Mis finanzas</h1>
          <MonthNav ym={ym} setYm={setYm} />
        </header>
        <div className="dgrid analisis-grid">
          <div className="dcol gap24">
            {chart}
            {ai}
          </div>
          <div className="dcol">{groups}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader title="Mis finanzas" onMenu={menu?.open} actions={<MonthNav ym={ym} setYm={setYm} />} />
      <div className="page-body tendencias-body">
        {chart}
        {ai}
        {groups}
      </div>
    </div>
  );
}

/** A budget row: what went out against the limit; the breakdown by subcategory lives in the category. */
function CatRow({ s }: { s: CatStat }) {
  const { cur, fx } = useApp();
  const over = s.projection !== null && s.limit !== null && s.projection > s.limit;
  const tone = s.cat.is_fixed ? 'muted' : s.level === 'over' ? 'destructive' : s.level === 'warn' ? 'warning' : 'default';
  const paid = s.cat.is_fixed && s.pct !== null && s.pct >= 100;
  const spent = `${amount(s.spent, cur, fx)}${s.limit ? ` de ${amount(s.limit, cur, fx)}` : ''} ${unitOf(cur)}`;
  return (
    <ListRow
      leading={<Emo e={s.cat.emoji} color={s.cat.color} size={40} />}
      title={s.cat.name}
      detail={over ? `Va a cerrar en ${amount(s.projection!, cur, fx)} ${unitOf(cur)}` : spent}
      detailTone={over ? 'destructive' : 'muted'}
      value={s.pct !== null ? (paid ? 'Pagado' : `${s.pct}%`) : undefined}
      valueTone={paid ? 'success' : tone === 'default' ? 'default' : tone}
      chevron
      href={`#/categoria/${s.cat.id}`}
      label={`${s.cat.name}: ${spent}`}
      below={s.limit ? <Progress size="sm" value={(s.pct || 0) / 100} tone={tone} label={`${s.cat.name}: ${s.pct || 0}% del límite`} /> : undefined}
    />
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
      <ListGroup title="Gasto por mes">
        <div className="group-pad">
          <div className="month-bars" role="img" aria-label={`Gasto de los últimos 6 meses: ${months.map((m) => `${monthShort(m.m)} ${shortK(m.total, cur, fx)}`).join(', ')}`}>
            {months.map((m, i) => {
              const over = budget > 0 && m.total > budget;
              const last = i === months.length - 1;
              return (
                <div key={i} className="mb-col">
                  <div className="mb-area">
                    {budget > 0 && <div className="mb-budget" style={{ bottom: `${(budget / max) * 100}%` }} />}
                    <div className={['mb-fill', last && 'is-on', over && 'is-over'].filter(Boolean).join(' ')} style={{ height: `${(m.total / max) * 100}%` }} />
                    {m.total > 0 && <span className={last ? 'mb-val is-on' : 'mb-val'} style={{ bottom: `calc(${(m.total / max) * 100}% + 4px)` }}>{shortK(m.total, cur, fx).replace(/^[¢$]/, '')}</span>}
                  </div>
                  <span className={last ? 'mb-label is-on' : 'mb-label'}>{monthShort(m.m)}</span>
                </div>
              );
            })}
          </div>
          {budget > 0 && <span className="mb-legend"><span className="mb-legend-line" />Presupuesto</span>}
        </div>
      </ListGroup>

      <ListGroup title={`${cap(monthName(ym[1]))} vs. ${monthName((ym[1] + 11) % 12)}`} note={isCurrent ? `Del 1 al ${day} de cada mes` : undefined}>
        {cmp.length === 0 ? (
          <div className="group-pad page-text">Todavía no hay datos para comparar.</div>
        ) : (
          cmp.map((x) => (
            <ListRow
              key={x.c.id}
              leading={<Emo e={x.c.emoji} color={x.c.color} size={40} />}
              title={x.c.name}
              detail={`${amount(x.a, cur, fx)} → ${amount(x.b, cur, fx)} ${unitOf(cur)}`}
              value={x.d !== null ? <Delta variant="arrow" value={`${Math.abs(x.d)}%`} tone={x.d > 0 ? 'bad' : 'good'} direction={x.d === 0 ? undefined : x.d > 0 ? 'up' : 'down'} /> : undefined}
              href={`#/categoria/${x.c.id}`}
            />
          ))
        )}
      </ListGroup>

      <ListGroup title="Top comercios" action={<Segmented size="sm" label="Ordenar comercios" value={topBy} onChange={pickTop} options={[{ value: 'amt', label: 'Monto' }, { value: 'n', label: 'Compras' }]} />}>
        {top.length === 0 ? (
          <div className="group-pad page-text">Sin gastos este mes.</div>
        ) : (
          top.map(([name, s]) => {
            const c = categories.find((x) => x.id === s.cat);
            const buys = `${s.n} ${s.n === 1 ? 'compra' : 'compras'}`;
            return (
              <ListRow
                key={name}
                leading={<Emo e={c?.emoji || '🛍️'} color={c?.color} size={40} img={s.photo} badge={s.badge} />}
                title={name}
                detail={[topBy === 'n' ? `${amount(s.amt, cur, fx)} ${unitOf(cur)}` : buys, c?.name || '']}
                value={topBy === 'n' ? buys : <>{amount(s.amt, cur, fx)}<span className="amt-unit"> {unitOf(cur)}</span></>}
              />
            );
          })
        )}
      </ListGroup>
    </>
  );
}
