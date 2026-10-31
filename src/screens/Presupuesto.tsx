import { useMemo, useState } from 'react';
import { BalanceSummary, Button, ChartSkeleton, Delta, GroupSkeleton, ListGroup, ListRow, Loader, PageHeader, Progress, Segmented, SummarySkeleton } from '../ds';
import { db } from '../lib/api';
import { buildPlan, usePlanData, type PlanLine, type Saving } from '../lib/budget';
import { daysUntil, shortDay } from '../lib/recurring';
import { IncomeSheet, SavingSheet } from '../ui/BudgetSheets';
import { PageSkeleton } from '../ui/Skeletons';
import { categoryStats, cumulative, inRange, monthBudget, monthRange, spend, sumSpend, weekRange, type CatStat } from '../lib/calc';
import { rootId } from '../lib/cats';
import { amount, cap, crIso, crLocal, money, monthName, monthShort, shortK, todayCR, unitOf } from '../lib/format';
import { useApp, useTxs } from '../store';
import { Emo, Icon, Loading } from '../ui';
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
 * Presupuesto (menu, route #/categorias): the month's plan (docs/comportamiento/presupuesto.md).
 * Up top what's left unassigned of the income; below the lines by kind: savings first, then fixed and
 * variable payments (from Recurrentes), the limits (categories) and what was spent without a plan.
 */
export function Categorias() {
  const { space, categories, accounts, cur, fx, toast, bump } = useApp();
  const [ym, setYm] = useMonth();
  const desk = useDesktop();
  const menu = useMenu();
  const d = useMonthData(ym);
  const pd = usePlanData(space?.id);
  const [sheet, setSheet] = useState<null | 'income' | Saving | 'new-saving'>(null);
  const [busy, setBusy] = useState(false);
  if (!space) return <PageSkeleton title="Presupuesto"><GroupSkeleton rows={5} below /></PageSkeleton>;
  const first = d.first || !pd;
  const base = { spaceId: space.id, txs: d.txs, categories, accounts, fx, recurring: pd?.recurring || [], savings: pd?.savings || [], goals: pd?.goals || [], months: pd?.months || [], carry: pd?.carry || [], marks: pd?.marks || [] };
  const plan = buildPlan({ ...base, ym });
  const mName = monthName(ym[1]);
  const u = unitOf(cur);
  const fmt = (v: number) => `${amount(v, cur, fx)} ${u}`;

  // PRS-06: last month's leftovers in the limits, asked once at the start of the next one
  const prevYm: [number, number] = [new Date(Date.UTC(ym[0], ym[1] - 1, 1)).getUTCFullYear(), new Date(Date.UTC(ym[0], ym[1] - 1, 1)).getUTCMonth()];
  const prev = d.isCurrent && pd ? buildPlan({ ...base, ym: prevYm }) : null;
  const prevRow = pd?.months.find((m) => m.month === prev?.monthKey);
  const prevUsed = prev ? d.txs.some((x) => inRange(x, monthRange(prevYm[0], prevYm[1]))) : false;
  const leftovers = prev && prevUsed && !prevRow?.closed_at ? prev.limits.filter((l) => l.planned - l.actual >= 1).map((l) => ({ cat: l.cat!, left: Math.round(l.planned - l.actual) })) : [];
  const leftTotal = leftovers.reduce((a, l) => a + l.left, 0);

  async function closePrev(carry: boolean) {
    if (!prev) return;
    setBusy(true);
    try {
      if (carry) await db.upsert('budget_carry', leftovers.map((l) => ({ space_id: space!.id, month: plan.monthKey, category_id: l.cat.id, amount: l.left })), 'space_id,month,category_id');
      await db.upsert('budget_months', { space_id: space!.id, month: prev.monthKey, closed_at: new Date().toISOString(), carried: carry }, 'space_id,month');
      toast(carry ? `${fmt(leftTotal)} pasaron a ${mName}` : `${cap(monthName(prevYm[1]))} cerrado`, async () => {
        if (carry) for (const l of leftovers) await db.remove('budget_carry', { space_id: space!.id, month: plan.monthKey, category_id: l.cat.id });
        await db.update('budget_months', { space_id: space!.id, month: prev.monthKey }, { closed_at: null, carried: null });
      });
      bump();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  async function markSaved(l: PlanLine, on: boolean) {
    const s = l.saving!;
    try {
      if (on) await db.upsert('budget_saving_marks', { saving_id: s.id, month: plan.monthKey }, 'saving_id,month');
      else await db.remove('budget_saving_marks', { saving_id: s.id, month: plan.monthKey });
      toast(on ? `${s.name}: apartado` : `${s.name}: sin apartar`, on ? () => db.remove('budget_saving_marks', { saving_id: s.id, month: plan.monthKey }) : undefined);
      bump();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  }

  const hasIncome = plan.income > 0;
  const summary = hasIncome ? (
    <BalanceSummary
      label={plan.unassigned < 0 ? 'Asignaste de más' : `Sin asignar en ${mName}`}
      value={amount(Math.abs(plan.unassigned), cur, fx)}
      unit={u}
      negative={plan.unassigned < 0}
      meta={`de ${fmt(plan.income)} de ingreso${plan.received > 0 && d.isCurrent ? ` · entraron ${fmt(plan.received)}` : ''}`}
      action={<Button variant="secondary" size="xs" onClick={() => setSheet('income')}>Ingreso</Button>}
    />
  ) : (
    <BalanceSummary
      label={`Gasto de ${mName}`}
      value={amount(d.spent, cur, fx)}
      unit={u}
      meta={d.budget > 0 ? `de ${fmt(d.budget)} en límites` : null}
      action={<Button variant="secondary" size="xs" onClick={() => setSheet('income')}>Agregar ingreso</Button>}
    />
  );

  const total = (v: number) => <span className="plan-total">{fmt(v)}</span>;
  const groups = (
    <>
      {leftovers.length > 0 && (
        <ListGroup title={`Cierre de ${monthName(prevYm[1])}`} note="Si lo dejás, queda en tus cuentas como ahorro.">
          <ListRow
            leading={<Emo icon="calendar" size={40} />}
            title="Te sobraron"
            detail={`${fmt(leftTotal)} en ${leftovers.length === 1 ? leftovers[0].cat.name : `${leftovers.length} categorías`}`}
            below={<div className="plan-close">
              <Button variant="secondary" size="xs" disabled={busy} onClick={() => closePrev(false)}>Dejarlo</Button>
              <Button variant="primary" size="xs" disabled={busy} onClick={() => closePrev(true)}>Pasar a {mName}</Button>
            </div>}
          />
        </ListGroup>
      )}

      <ListGroup title="Ahorro" action={total(plan.total.savings)} note={plan.savings.length ? undefined : 'Lo que apartás cada mes antes de gastar: emergencias, inversión, una meta.'}>
        {plan.savings.map((l) => {
          const auto = !!l.goal?.goal_accounts?.length;
          // a row that asks for an answer carries its amount in the detail (línea visual)
          const ask = !l.done && !auto && l.actual === 0 && d.isCurrent;
          return (
            <ListRow
              key={l.key}
              leading={<Emo icon="piggy" color="mint" size={40} />}
              title={l.title}
              detail={l.done ? (l.goal ? `Apartado · ${l.goal.name}` : 'Apartado') : l.actual > 0 ? `Faltan ${fmt(l.planned - l.actual)}` : ask ? `${fmt(l.planned)} · por apartar` : l.goal ? `Para ${l.goal.name}` : 'Por apartar'}
              detailTone={l.done ? 'success' : 'muted'}
              value={ask ? undefined : <>{amount(l.planned, cur, fx)}<span className="amt-unit"> {u}</span></>}
              actions={ask ? <Button variant="secondary" size="xs" onClick={() => markSaved(l, true)}>Aparté</Button> : undefined}
              onClick={() => setSheet(l.saving!)}
              chevron
              label={`${l.title}: ${fmt(l.planned)}`}
            />
          );
        })}
        <ListRow leading={<Icon name="plus" size={16} />} title="Agregar ahorro" onClick={() => setSheet('new-saving')} quiet />
      </ListGroup>

      {[['Fijos', plan.fixed, plan.total.fixed], ['Variables', plan.variable, plan.total.variable]].map(([title, ls, t]) => (ls as PlanLine[]).length > 0 && (
        <ListGroup key={title as string} title={title as string} action={total(t as number)} note={title === 'Variables' ? 'Estimado con el promedio de los últimos pagos.' : undefined}>
          {(ls as PlanLine[]).map((l) => <PaymentRow key={l.key} l={l} />)}
        </ListGroup>
      ))}
      {plan.fixed.length + plan.variable.length === 0 && (
        <ListGroup title="Fijos y variables">
          <ListRow leading={<Icon name="repeat" size={16} />} title="Agregá tus pagos fijos" detail="Alquiler, luz, internet: salen de Recurrentes" href="#/recurrentes" chevron quiet />
        </ListGroup>
      )}

      <ListGroup title="Límites" action={<>{total(plan.total.limits)} <a href="#/categoria/nueva">Nueva</a></>}>
        {plan.limits.length === 0 ? (
          <div className="group-pad page-text">Ponele un límite a una categoría (restaurantes, súper) para saber cuánto te queda.</div>
        ) : plan.limits.map((l) => <LimitRow key={l.key} l={l} isCurrent={d.isCurrent} />)}
      </ListGroup>

      {plan.unplanned.length > 0 && (
        <ListGroup title="Sin plan" action={total(plan.unplanned.reduce((a, l) => a + l.actual, 0))} note="Gastos de categorías sin límite.">
          {plan.unplanned.map((l) => (
            <ListRow
              key={l.key}
              leading={<Emo e={l.cat?.emoji || '🛍️'} color={l.cat?.color} size={40} />}
              title={l.title}
              value={<>{amount(l.actual, cur, fx)}<span className="amt-unit"> {u}</span></>}
              href={l.cat ? `#/categoria/${l.cat.id}` : undefined}
              chevron={!!l.cat}
            />
          ))}
        </ListGroup>
      )}
    </>
  );

  const sheets = (
    <>
      {sheet === 'income' && <IncomeSheet plan={plan} spaceId={space.id} monthLabel={mName} onClose={() => setSheet(null)} />}
      {sheet && sheet !== 'income' && (
        <SavingSheet saving={sheet === 'new-saving' ? null : sheet} spaceId={space.id} goals={pd?.goals || []} nextSort={(pd?.savings.length || 0) + 1} onClose={() => setSheet(null)} />
      )}
    </>
  );

  if (desk) {
    return (
      <div className="dpage">
        <header className="dpage-head">
          <h1 className="dtitle">Presupuesto</h1>
          <MonthNav ym={ym} setYm={setYm} />
        </header>
        {first ? (
          <Loader><div className="dcol gap24 dnarrow"><SummarySkeleton /><GroupSkeleton rows={6} below /></div></Loader>
        ) : (
          <div className="dcol gap24 dnarrow">
            {summary}
            {groups}
          </div>
        )}
        {sheets}
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader title="Presupuesto" onMenu={menu?.open} actions={<MonthNav ym={ym} setYm={setYm} />} />
      <div className="page-hero">{first ? <Loader><SummarySkeleton /></Loader> : summary}</div>
      <div className="page-body">{first ? <Loader><GroupSkeleton rows={5} below /></Loader> : groups}</div>
      {sheets}
    </div>
  );
}

/** A fixed or variable payment of the month: when it's due or when it was paid (PRS-02, PRS-03). */
function PaymentRow({ l }: { l: PlanLine }) {
  const { cur, fx } = useApp();
  const r = l.recurring!;
  const approx = l.kind === 'variable' && !l.done;
  const detail = l.done
    ? `Pagado el ${shortDay(l.paidOn!)}`
    : l.due.length > 1
      ? `${l.due.length} pagos · el próximo el ${shortDay(l.due[0])}`
      : `${daysUntil(l.due[0]) < 0 ? 'Venció' : 'Vence'} el ${shortDay(l.due[0])}`;
  return (
    <ListRow
      leading={l.cat ? <Emo e={l.cat.emoji} color={l.cat.color} size={40} /> : <Emo icon={r.kind === 'transfer' ? 'exchange' : 'repeat'} size={40} />}
      title={l.title}
      detail={detail}
      detailTone={l.done ? 'success' : !l.done && l.due[0] && daysUntil(l.due[0]) < 0 ? 'warning' : 'muted'}
      value={<>{approx ? '≈ ' : ''}{amount(l.planned, cur, fx)}<span className="amt-unit"> {unitOf(cur)}</span></>}
      valueTone={l.done ? 'muted' : 'default'}
      href={`#/recurrente/${r.id}`}
      chevron
    />
  );
}

/** A limit: what's left of it this month, with its bar (PRS-04). */
function LimitRow({ l, isCurrent }: { l: PlanLine; isCurrent: boolean }) {
  const { cur, fx } = useApp();
  const c = l.cat!;
  const left = l.planned - l.actual;
  const pct = l.planned > 0 ? Math.round((l.actual / l.planned) * 100) : 0;
  const tone = c.is_fixed ? 'muted' : pct >= 100 ? 'destructive' : pct >= 80 ? 'warning' : 'default';
  const u = unitOf(cur);
  return (
    <ListRow
      leading={<Emo e={c.emoji} color={c.color} size={40} />}
      title={c.name}
      detail={left >= 0 ? `${isCurrent ? 'Quedan' : 'Sobraron'} ${amount(left, cur, fx)} de ${amount(l.planned, cur, fx)} ${u}` : `Te pasaste por ${amount(-left, cur, fx)} ${u}`}
      detailTone={left < 0 && !c.is_fixed ? 'destructive' : 'muted'}
      value={`${pct}%`}
      valueTone={tone}
      chevron
      href={`#/categoria/${c.id}`}
      label={`${c.name}: ${amount(l.actual, cur, fx)} de ${amount(l.planned, cur, fx)} ${u}`}
      below={<Progress size="sm" value={Math.min(pct, 100) / 100} tone={tone} label={`${c.name}: ${pct}% del límite`} />}
    />
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

function Analysis({ txs, ym }: { txs: ReturnType<typeof useTxs>['txs']; ym: [number, number] }) {
  const { categories, cur, fx, merchants, space, spaces } = useApp();
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

  // money put into shared spaces this month: not spending here (it's spent there), shown apart (MOV-03)
  const shared = new Map<string, number>();
  inMonth.forEach((x) => {
    if (x.kind !== 'transfer' || x.hold || x.space_id !== space?.id || !x.to_space_id || x.to_space_id === space?.id) return;
    shared.set(x.to_space_id, (shared.get(x.to_space_id) || 0) + Number(x.amount_crc));
  });
  const sharedRows = [...shared.entries()].sort((a, b) => b[1] - a[1]);
  const sharedTotal = sharedRows.reduce((a, [, v]) => a + v, 0);

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

      {sharedRows.length > 0 && (
        <ListGroup title="Puesto en espacios compartidos" note="No cuenta como gasto aquí: se gasta en el espacio que lo recibe.">
          {sharedRows.map(([sid, v]) => {
            const sp = spaces.find((x) => x.id === sid);
            return (
              <ListRow
                key={sid}
                leading={<Emo e={sp?.emoji || '👥'} color="mint" size={40} />}
                title={sp?.name || 'Espacio compartido'}
                value={<>{amount(v, cur, fx)}<span className="amt-unit"> {unitOf(cur)}</span></>}
              />
            );
          })}
          {sharedRows.length > 1 && <ListRow title="Total" value={<>{amount(sharedTotal, cur, fx)}<span className="amt-unit"> {unitOf(cur)}</span></>} />}
        </ListGroup>
      )}

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
