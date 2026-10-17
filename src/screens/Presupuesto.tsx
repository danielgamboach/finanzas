import { useMemo, useState } from 'react';
import { categoryStats, inRange, monthBudget, monthRange, spend, sumSpend, weekRange, type CatStat } from '../lib/calc';
import { rootId } from '../lib/cats';
import { crIso, crLocal, money, monthName, monthShort, shortK, todayCR } from '../lib/format';
import { useApp, useTxs } from '../store';
import { Emo, Icon, Loading, Nav, Segmented, TopBar } from '../ui';
import { MonthNav, useMonth } from './Home';

export function Presupuesto() {
  const { space, categories, cur, fx } = useApp();
  const [tab, setTab] = useState<'limits' | 'analysis'>('limits');
  const [ym, setYm] = useMonth();
  const t = todayCR();
  const isCurrent = ym[0] === t.y && ym[1] === t.m;
  const month = monthRange(ym[0], ym[1]);
  const week = weekRange(space?.week_start ?? 5);
  // six months back for the analysis, plus the current week
  const range = useMemo(() => ({ from: crIso(ym[0], ym[1] - 5, 1), to: [month.to, week.to].sort()[1] }), [ym, month.to, week.to]);
  const { txs, loading } = useTxs(range);

  if (!space) return <Loading />;
  const stats = categoryStats(categories, txs, month, week, isCurrent);
  const inMonth = txs.filter((x) => inRange(x, month));
  const spent = sumSpend(inMonth);
  const budget = stats.reduce((a, s) => a + (s.cat.limit_amount ? (s.cat.limit_period === 'weekly' ? Number(s.cat.limit_amount) * 4.33 : Number(s.cat.limit_amount)) : 0), 0);
  const l = crLocal(month.from);
  const daysInMonth = new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth() + 1, 0)).getUTCDate();
  const pace = isCurrent ? Math.round((t.d / daysInMonth) * 100) : 100;
  const usedPct = budget ? Math.round((spent / budget) * 100) : 0;
  const warnCount = stats.filter((s) => s.level === 'warn' || s.level === 'over').length;
  const fixedSpent = sumSpend(inMonth.filter((x) => stats.find((s) => s.cat.id === rootId(categories, x.category_id))?.cat.is_fixed));
  const variableSpent = spent - fixedSpent;
  const projection = isCurrent ? fixedSpent + Math.round((variableSpent / Math.max(t.d, 1)) * daysInMonth) : spent;

  return (
    <div className="screen">
      <TopBar />
      <h1 className="headline">
        Llevás <strong>{money(spent, cur, fx)}</strong>
        {budget > 0 ? <> de {money(budget, cur, fx)}</> : null} en {monthName(ym[1])}
      </h1>
      <MonthNav ym={ym} setYm={setYm} />
      <Segmented value={tab} options={[['limits', 'Límites'], ['analysis', 'Análisis']]} onChange={setTab} dark />

      {loading && txs.length === 0 ? (
        <Loading />
      ) : tab === 'limits' ? (
        <>
          {budget > 0 && (
            <div className="card pad col gap10">
              <div className="row between small-strong">
                <span>{usedPct}% usado</span>
                <span className="muted">{isCurrent ? `Día ${t.d} de ${daysInMonth}` : 'Mes cerrado'}</span>
              </div>
              <div className="bar big">
                <div className="bar-fill" style={{ width: `${Math.min(usedPct, 100)}%`, background: usedPct >= 100 ? '#C8372D' : usedPct >= 80 ? '#C27C00' : '#111' }} />
                {isCurrent && <div className="bar-marker" style={{ left: `${pace}%` }} />}
              </div>
              {isCurrent && <span className="muted small">La línea marca dónde deberías ir a esta altura del mes</span>}
            </div>
          )}

          <div className="grid2">
            <div className="bento butter tight">
              <span className="bento-emoji">⚠️</span>
              <span className="bento-num">{warnCount}</span>
              <span className="bento-sub">categorías cerca o pasadas del límite</span>
            </div>
            <div className={budget && projection > budget ? 'bento pink tight' : 'bento mint tight'}>
              <span className="bento-emoji">📈</span>
              <span className="bento-num sm">{money(projection, cur, fx)}</span>
              <span className="bento-sub">
                {isCurrent ? 'proyección de cierre' : 'cierre del mes'}
                {budget ? (projection > budget ? ` · ${money(projection - budget, cur, fx)} sobre` : ' · dentro del total') : ''}
              </span>
            </div>
          </div>

          <div className="section-head">
            <h2 className="h2">Categorías</h2>
            <a href="#/categoria/nueva" className="btn-dark sm"><Icon name="plus" size={16} stroke={2.6} />Nueva</a>
          </div>
          <div className="col gap8">
            {stats.map((s) => <CatRow key={s.cat.id} s={s} />)}
          </div>
        </>
      ) : (
        <Analysis txs={txs} ym={ym} />
      )}
      <Nav active="budget" />
    </div>
  );
}

/** A budget row; parents with subcategories get an expandable breakdown. */
function CatRow({ s }: { s: CatStat }) {
  const { cur, fx } = useApp();
  const [open, setOpen] = useState(false);
  const over = s.projection !== null && s.limit !== null && s.projection > s.limit;
  const bar = s.cat.is_fixed ? '#A3A39E' : s.level === 'over' ? '#C8372D' : s.level === 'warn' ? '#C27C00' : '#111';
  const subs = s.subs.filter((x) => x.spent !== 0 || !x.direct);
  const kids = s.subs.filter((x) => !x.direct).length;
  return (
    <div className="card cat-card">
      <a href={`#/categoria/${s.cat.id}`} className="cat-row">
        <Emo e={s.cat.emoji} color={s.cat.color} />
        <span className="grow col gap6">
          <span className="row gap6">
            <strong>{s.cat.name}</strong>
            <span className="chip">{s.periodLabel}</span>
            <span className={`ml-auto pct lvl-${s.level}`}>{s.pct !== null ? (s.cat.is_fixed && s.pct >= 100 ? '✅ Pagado' : `${s.pct}%`) : ''}</span>
          </span>
          {s.limit ? (
            <span className="bar"><span className="bar-fill" style={{ width: `${Math.min(s.pct || 0, 100)}%`, background: bar }} /></span>
          ) : null}
          <span className="strong-sm">
            {money(s.spent, cur, fx)}
            {s.limit ? ` de ${money(s.limit, cur, fx)}` : ' · sin límite'}
          </span>
          {s.projection !== null && s.limit !== null && (
            <span className={over ? 'small danger' : 'small muted'}>
              {over ? '🔺 ' : ''}Proyección {money(s.projection, cur, fx)}
              {over ? ` · ${money(s.projection - s.limit, cur, fx)} sobre el límite` : ' · dentro del límite'}
            </span>
          )}
        </span>
        <Icon name="chevRight" size={18} />
      </a>
      {kids > 0 && (
        <>
          <button className="sub-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
            <span>{open ? 'Ocultar detalle' : `Ver detalle · ${kids} ${kids === 1 ? 'subcategoría' : 'subcategorías'}`}</span>
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
                      <span className="bar thin"><span className="bar-fill" style={{ width: `${Math.min(pct, 100)}%`, background: '#8A8A85' }} /></span>
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
  const { categories, cur, fx } = useApp();
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
  const total = sumSpend(inMonth);
  const fixed = sumSpend(inMonth.filter((x) => categories.find((c) => c.id === rootId(categories, x.category_id))?.is_fixed));
  const fixedPct = total ? Math.round((fixed / total) * 100) : 0;

  const shops = new Map<string, { n: number; amt: number; cat?: string }>();
  inMonth.filter((x) => x.kind === 'expense').forEach((x) => {
    const k = x.merchant || 'Sin nombre';
    const s = shops.get(k) || { n: 0, amt: 0, cat: x.category_id || undefined };
    s.n += 1;
    s.amt += spend(x);
    shops.set(k, s);
  });
  const top = [...shops.entries()].sort((a, b) => b[1].amt - a[1].amt).slice(0, 5);

  return (
    <>
      <section className="card pad col gap14">
        <div className="col">
          <h2 className="h3">Gasto por mes</h2>
          {budget > 0 && <span className="muted small">La caja punteada es el presupuesto de {money(budget, cur, fx)}</span>}
        </div>
        <div className="month-bars" role="img" aria-label={`Gasto de los últimos 6 meses: ${months.map((m) => `${monthShort(m.m)} ${shortK(m.total, cur, fx)}`).join(', ')}`}>
          {months.map((m, i) => {
            const over = budget > 0 && m.total > budget;
            const last = i === months.length - 1;
            return (
              <div key={i} className="mb-col">
                <div className="mb-area">
                  <div className="mb-fill" style={{ height: `${(m.total / max) * 100}%`, background: last ? '#F6E3A0' : over ? '#F3B9B2' : '#E2E2DE' }} />
                  {budget > 0 && <div className="mb-budget" style={{ height: `${(budget / max) * 100}%` }} />}
                  <span className={over ? 'mb-val danger' : 'mb-val'}>{shortK(m.total, cur, fx).replace(/^[₡$]/, '')}</span>
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
          <span className="muted small">{isCurrent ? `Mismo periodo: del 1 al ${day} de cada mes` : 'Meses completos'}</span>
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

      <div className="grid2">
        <div className="bento gray tight">
          <span className="bento-emoji">🏠</span>
          <span className="bento-sub">Fijos · {fixedPct}%</span>
          <span className="bento-num sm">{money(fixed, cur, fx)}</span>
        </div>
        <div className="bento mint tight">
          <span className="bento-emoji">🛒</span>
          <span className="bento-sub">Variables · {100 - fixedPct}%</span>
          <span className="bento-num sm">{money(total - fixed, cur, fx)}</span>
        </div>
      </div>

      <section className="card list">
        <h2 className="h3 pad-top">Top comercios</h2>
        {top.length === 0 ? (
          <span className="empty">Sin gastos este mes.</span>
        ) : (
          top.map(([name, s], i) => {
            const c = categories.find((x) => x.id === s.cat);
            return (
              <div key={name} className="row gap12 list-row">
                <span className="rank">{i + 1}</span>
                <Emo e={c?.emoji || '🛍️'} color={c?.color} size={40} />
                <span className="grow col">
                  <strong className="sm">{name}</strong>
                  <span className="muted small">{s.n} {s.n === 1 ? 'compra' : 'compras'}{c ? ` · ${c.name}` : ''}</span>
                </span>
                <strong className="sm">{money(s.amt, cur, fx)}</strong>
              </div>
            );
          })
        )}
      </section>
    </>
  );
}
