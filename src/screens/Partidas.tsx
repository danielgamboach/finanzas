import { useMemo, useState } from 'react';
import { ActionBar, BalanceSummary, Button, EmptyState, GroupSkeleton, ListGroup, ListRow, Loader, PageHeader, Progress, SummarySkeleton, TxListSkeleton } from '../ds';
import { db } from '../lib/api';
import { monthRange, spend } from '../lib/calc';
import { buildBudget, categoryAverage, toCrc, useBudgetData, type Line, type OpenPlan, type PlanGroup } from '../lib/budget';
import { pickerOrder } from '../lib/cats';
import { amount, monthName, parseAmount, todayCR, unitOf } from '../lib/format';
import type { Currency, Tx } from '../lib/types';
import { navigateBack, useApp, useTxs } from '../store';
import { Emo, Icon } from '../ui';
import { FormPageSkeleton, PageSkeleton } from '../ui/Skeletons';
import { TxRow } from '../ui/TxRow';
import { groupByDay } from './Home';
import { useDesktop } from '../lib/useDesktop';
import { useMenu } from '../lib/menu';

/** This month's plan for the current space: real and planned movements (PRM). */
export function useBudget() {
  const { space, categories, accounts, fx } = useApp();
  const t = todayCR();
  const range = useMemo(() => monthRange(t.y, t.m), [t.y, t.m]);
  const { txs, loading } = useTxs(range);
  const data = useBudgetData(space?.id);
  const budget = data && space ? buildBudget({ ...data, categories, accounts, txs, spaceId: space.id, fx }) : null;
  return { budget, data, txs, first: (loading && txs.length === 0) || !data };
}

const tone = (pct: number) => (pct >= 100 ? 'destructive' : pct >= 80 ? 'warning' : 'default') as 'destructive' | 'warning' | 'default';

function useMoney() {
  const { cur, fx } = useApp();
  const u = unitOf(cur);
  return { u, fmt: (v: number) => amount(v, cur, fx), node: (v: number, approx = false) => <>{approx ? '≈ ' : ''}{amount(v, cur, fx)}<span className="amt-unit"> {u}</span></> };
}

/** An open plan: what's left of it this month, with its bar (PRM-04). */
function PlanRow({ p }: { p: OpenPlan }) {
  const m = useMoney();
  const pct = p.amount > 0 ? Math.round((p.spent / p.amount) * 100) : 0;
  const over = p.left < 0;
  const c = p.cats[0];
  return (
    <ListRow
      leading={c ? <Emo e={c.emoji} color={c.color} size={40} /> : <Emo icon="envelope" size={40} />}
      title={c ? c.name : p.line.name}
      detail={!c ? 'Elegí la categoría' : over ? `Te pasaste por ${m.fmt(-p.left)}` : p.spent > 0 ? `Gastado ${m.fmt(p.spent)}` : 'Sin gastos todavía'}
      detailTone={!c ? 'warning' : over ? 'destructive' : 'muted'}
      value={m.node(Math.max(p.amount, p.spent))}
      valueTone={p.left > 0 ? 'muted' : 'default'}
      href={c ? `#/partida/${p.line.id}` : `#/partida/${p.line.id}/editar`}
      chevron
      label={`${c ? c.name : p.line.name}: ${m.fmt(p.spent)} de ${m.fmt(p.amount)} ${m.u}`}
      below={<Progress size="sm" value={Math.min(pct, 100) / 100} tone={tone(pct)} label={`${pct}% usado`} />}
    />
  );
}

/** Real movements no plan covers, when there are many: one row that unfolds into them. */
function LooseFold({ g, txs }: { g: PlanGroup; txs: Tx[] }) {
  const m = useMoney();
  const [open, setOpen] = useState(false);
  const n = txs.length;
  const planned = g.recs.length + g.plans.length > 0;
  const what = g.section === 'in' ? (n === 1 ? 'ingreso' : 'ingresos') : g.section === 'save' ? (n === 1 ? 'movimiento' : 'movimientos') : n === 1 ? 'gasto' : 'gastos';
  return (
    <>
      <ListRow
        leading={<span className={`plan-chev${open ? ' is-open' : ''}`}><ListRow.Icon name="chevDown" /></span>}
        title={`${n} ${what}${planned ? ' sin planear' : ''}`}
        value={m.node(txs.reduce((a, x) => a + (g.section === 'out' ? spend(x) : Number(x.amount_crc)), 0))}
        onClick={() => setOpen(!open)}
        label={`${open ? 'Esconder' : 'Ver'} ${n} ${what}`}
      />
      {open && <div className="plan-moves">{txs.map((x) => <TxRow key={x.id} t={x} size="sheet" showDate />)}</div>}
    </>
  );
}

const byDate = (a: Tx, b: Tx) => a.occurred_at.localeCompare(b.occurred_at);
const FOLD = 3;

function Group({ g }: { g: PlanGroup }) {
  const m = useMoney();
  const title = g.category ? `${g.category.emoji} ${g.title}` : g.title;
  // every payment of a recurrent is a movement: the real ones and the ones still due (PRM-02); a few unplanned ones show too
  const fold = g.loose.length > FOLD ? g.loose : [];
  const moves = [...g.recs.flatMap((s) => [...s.txs, ...s.planned]), ...(fold.length ? [] : g.loose)].sort(byDate);
  return (
    <ListGroup title={title} action={<span className="plan-total">{m.fmt(g.total)} {m.u}</span>}>
      {g.plans.map((p) => <PlanRow key={p.line.id} p={p} />)}
      {moves.length > 0 && <div className="plan-moves">{moves.map((x) => <TxRow key={x.id} t={x} size="sheet" showDate={!x.planned} />)}</div>}
      {fold.length > 0 && <LooseFold g={g} txs={fold} />}
    </ListGroup>
  );
}

/** Presupuesto (menu, route #/categorias): the month written ahead, real and planned movements by category (PRM-01). */
export function Presupuesto() {
  const { space } = useApp();
  const desk = useDesktop();
  const menu = useMenu();
  const m = useMoney();
  const { budget: b, first } = useBudget();
  if (!space) return <PageSkeleton title="Presupuesto"><GroupSkeleton rows={5} /></PageSkeleton>;
  const t = todayCR();
  const month = monthName(t.m);

  const summary = b && (
    <BalanceSummary
      label={b.free < 0 ? `Te pasás en ${month}` : `Libre en ${month}`}
      value={m.fmt(Math.abs(b.free))}
      unit={m.u}
      negative={b.free < 0}
      meta={`Entra ${m.fmt(b.entra)} · sale ${m.fmt(b.sale)}${b.aparta ? ` · apartás ${m.fmt(b.aparta)}` : ''} ${m.u}`}
    />
  );

  const empty = b && !b.groups.length && !b.income.recs.length && !b.income.loose.length && !b.save.recs.length && !b.save.loose.length;
  const body = b && (
    <>
      {empty && (
        <EmptyState icon={<Icon name="list" size={24} />} title={`Planeá ${month}`} action={<Button variant="primary" size="sm" onClick={() => (location.hash = '#/partida/nueva')}>Planear</Button>}>
          Lo que entra, lo que pagás cada mes y cuánto querés gastar en súper o restaurantes.
        </EmptyState>
      )}
      {(b.income.recs.length > 0 || b.income.loose.length > 0) && <Group g={b.income} />}
      {b.groups.map((g) => <Group key={g.key} g={g} />)}
      {(b.save.recs.length > 0 || b.save.loose.length > 0) && <Group g={b.save} />}
      {!empty && (
        <ListGroup>
          <ListRow leading={<ListRow.Icon name="plus" />} title="Planear algo más" href="#/partida/nueva" quiet />
        </ListGroup>
      )}
    </>
  );

  const title = `Presupuesto de ${month}`;
  if (desk) {
    return (
      <div className="dpage">
        <header className="dpage-head"><h1 className="dtitle">Presupuesto</h1><span className="muted">{month}</span></header>
        {first ? <Loader><div className="dcol gap24 dnarrow"><SummarySkeleton /><GroupSkeleton rows={5} /></div></Loader> : <div className="dcol gap24 dnarrow">{summary}{body}</div>}
      </div>
    );
  }
  return (
    <div className="page">
      <PageHeader title="Presupuesto" onMenu={menu?.open} actions={<Button variant="secondary" size="xs" iconOnly onClick={() => (location.hash = '#/partida/nueva')} aria-label="Planear"><Icon name="plus" size={14} /></Button>} />
      <div className="page-hero" aria-label={title}>{first ? <Loader><SummarySkeleton /></Loader> : summary}</div>
      <div className="page-body">{first ? <Loader><GroupSkeleton rows={5} /></Loader> : body}</div>
    </div>
  );
}

/** An open plan (#/partida/<id>): what's left, the pace and this month's movements. */
export function LineView({ id }: { id: string }) {
  const { space } = useApp();
  const m = useMoney();
  const { budget, first } = useBudget();
  const p = budget?.plans.find((x) => x.line.id === id);
  if (!space || first) return <PageSkeleton back nav={false}><TxListSkeleton /></PageSkeleton>;
  if (!p) return <div className="page no-nav"><PageHeader title="Presupuesto" onBack={navigateBack} /><EmptyState icon={<Icon name="list" size={24} />} title="Ese plan ya no existe" /></div>;
  const t = todayCR();
  const days = new Date(Date.UTC(t.y, t.m + 1, 0)).getUTCDate() - t.d + 1;
  const pace = p.left > 0 && days > 1 ? ` · ${m.fmt(p.left / days)} ${m.u} por día` : '';
  const groups = groupByDay(p.txs);
  const name = p.cats[0]?.name || p.line.name;
  return (
    <div className="page no-nav">
      <PageHeader title={name} onBack={navigateBack}
        actions={<Button variant="secondary" size="xs" iconOnly onClick={() => (location.hash = `#/partida/${id}/editar`)} aria-label="Editar plan"><Icon name="pencil" size={14} /></Button>} />
      <div className="page-hero">
        <BalanceSummary
          label={p.left < 0 ? 'Te pasaste por' : `Quedan en ${monthName(t.m)}`}
          value={m.fmt(Math.abs(p.left))}
          unit={m.u}
          negative={p.left < 0}
          meta={`de ${m.fmt(p.amount)} ${m.u} · ${days === 1 ? 'último día' : `${days} días`}${pace}`}
        />
      </div>
      <div className="page-body">
        {groups.length === 0 ? (
          <EmptyState icon={<Icon name="list" size={24} />} title={`Sin gastos en ${monthName(t.m)}`} />
        ) : (
          <div className="mb-flat">
            {groups.map((g) => (
              <section key={g.label} className="mb-day">
                <div className="mb-day-head row between"><span>{g.label}</span>{g.total !== 0 && <span>{m.fmt(g.total)} {m.u}</span>}</div>
                {g.rows.map((x) => <TxRow key={x.id} t={x} size="sheet" />)}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** What to plan (#/partida/nueva): a variable expense opens the plan editor; the rest are recurrents (PRM-03). */
function PlanChooser() {
  return (
    <div className="page no-nav">
      <PageHeader title="Planear" onBack={navigateBack} />
      <div className="page-body">
        <ListGroup>
          <ListRow leading={<Emo icon="envelope" size={40} />} title="Gasto variable" detail="Súper, restaurantes, gasolina" href="#/partida/nueva/abierto" chevron />
          <ListRow leading={<Emo icon="calendar" size={40} />} title="Pago que se repite" detail="Alquiler, luz, suscripciones" href="#/recurrente/nueva" chevron />
          <ListRow leading={<Emo icon="arrowDownLeft" size={40} />} title="Ingreso" detail="Salario, lo que te depositan cada mes" href="#/recurrente/nueva/ingreso" chevron />
          <ListRow leading={<Emo icon="piggy" color="mint" size={40} />} title="Ahorro" detail="Plata que movés a otra cuenta cada mes" href="#/recurrente/nueva/ahorro" chevron />
        </ListGroup>
      </div>
    </div>
  );
}

/** Add or edit an open plan (#/partida/nueva/abierto, #/partida/<id>/editar): a category and an amount for the month (PRM-04). */
export function LineEdit({ id, sub }: { id: string; sub?: string }) {
  if (id === 'nueva' && sub !== 'abierto') return <PlanChooser />;
  return <OpenPlanEdit id={id} />;
}

function OpenPlanEdit({ id }: { id: string }) {
  const { space, categories, cur, fx, toast, bump } = useApp();
  const { data } = useBudget();
  const t = todayCR();
  const hist = useMemo(() => ({ from: monthRange(t.y, t.m - 3).from, to: monthRange(t.y, t.m).from }), [t.y, t.m]);
  const { txs: past } = useTxs(hist);
  const isNew = id === 'nueva';
  const existing = data?.lines.find((l) => l.id === id) || null;
  const [form, setForm] = useState<null | { catId: string; amt: string; currency: Currency }>(null);
  const [busy, setBusy] = useState(false);
  if (!space || !data || (!isNew && !existing)) return <FormPageSkeleton title={isNew ? 'Gasto variable' : 'Editar plan'} />;

  const lines = data.lines.filter((l) => l.active && !l.is_rest && l.kind === 'cap');
  const f = form || {
    catId: data.links.find((l) => l.envelope_id === existing?.id)?.category_id || '',
    amt: existing?.amount ? typed(Number(existing.amount)) : '',
    currency: existing?.currency || cur,
  };
  const set = (p: Partial<typeof f>) => setForm({ ...f, ...p });
  const num = parseAmount(f.amt);
  // a category is in one plan only
  const taken = new Set(data.links.filter((l) => l.envelope_id !== existing?.id && lines.some((x) => x.id === l.envelope_id)).map((l) => l.category_id));
  const options = pickerOrder(categories.filter((c) => c.kind === 'expense' && !c.archived));
  const cat = categories.find((c) => c.id === f.catId);
  const avg = f.catId ? categoryAverage(past, categories, f.catId) : 0;
  const inCur = (crc: number) => (f.currency === 'USD' ? crc / fx : crc);
  const valid = !!cat && num > 0;

  async function save() {
    if (!space || !valid || !cat) return;
    setBusy(true);
    try {
      const row = { name: cat.name, amount: Math.round(num * 100) / 100, currency: f.currency, kind: 'cap', period: 'monthly', recurring_id: null, group_category_id: null, amount_auto: false, account_id: null };
      let lineId = existing?.id;
      if (lineId) await db.update('envelopes', { id: lineId }, row);
      else lineId = (await db.insert<Line>('envelopes', { ...row, space_id: space.id, sort: lines.length + 1 }))[0].id;
      const before = data!.links.filter((l) => l.envelope_id === lineId).map((l) => l.category_id);
      for (const c of before) if (c !== cat.id) await db.remove('envelope_categories', { category_id: c });
      if (!before.includes(cat.id)) await db.insert('envelope_categories', [{ category_id: cat.id, envelope_id: lineId }]);
      toast(isNew ? `${cat.name} planeado` : `${cat.name} guardado`);
      bump();
      history.back();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    try {
      await db.update('envelopes', { id: existing.id }, { active: false });
      toast(`${existing.name} ya no está planeado`, () => db.update('envelopes', { id: existing.id }, { active: true }));
      bump();
      location.hash = '#/categorias';
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo borrar');
    }
  }

  return (
    <div className="page no-nav">
      <PageHeader title={isNew ? 'Gasto variable' : 'Editar plan'} onBack={navigateBack} />
      <div className="page-body">
        <p className="page-text">Cuánto querés gastar al mes en una categoría. Cada gasto de esa categoría lo va usando, y se repite cada mes.</p>
        <div className="field-card">
          <label className="field-row">
            <span>Categoría</span>
            <select value={f.catId} onChange={(e) => set({ catId: e.target.value })} aria-label="Categoría">
              <option value="">Elegí una</option>
              {options.map((c) => <option key={c.id} value={c.id} disabled={taken.has(c.id)}>{c.parent_id ? '  ' : ''}{c.emoji} {c.name}{taken.has(c.id) ? ' (ya está planeada)' : ''}</option>)}
            </select>
          </label>
          <label className="field-row">
            <span>Monto al mes</span>
            <input inputMode="decimal" value={f.amt} onChange={(e) => set({ amt: e.target.value.replace(/[^0-9.,]/g, '') })} placeholder="0" aria-label="Monto al mes" />
          </label>
          <label className="field-row">
            <span>Moneda</span>
            <select value={f.currency} onChange={(e) => set({ currency: e.target.value as Currency })} aria-label="Moneda">
              <option value="CRC">Colones</option>
              <option value="USD">Dólares</option>
            </select>
          </label>
        </div>
        {cat && avg > 0 && (
          <div className="row between gap10 env-sug">
            <span className="page-text">Promedio de los últimos 3 meses: {amount(avg, f.currency, fx)} {unitOf(f.currency)}</span>
            <Button variant="secondary" size="xs" onClick={() => set({ amt: typed(Math.round(inCur(avg))) })}>Usar</Button>
          </div>
        )}
        <p className="page-text">Te avisamos al llegar al 80% y si te pasás.</p>
        {existing && (
          <div className="page-actions">
            <Button variant="ghost" size="md" block className="danger" onClick={remove} leading={<Icon name="trash" size={16} />}>Quitar del presupuesto</Button>
          </div>
        )}
      </div>
      <ActionBar>
        <Button variant="primary" size="lg" block disabled={busy || !valid} onClick={save}>{isNew ? 'Planear' : 'Guardar'}</Button>
      </ActionBar>
    </div>
  );
}

function typed(n: number) {
  const [i, d] = n.toFixed(2).split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d !== '00' ? `,${d}` : '');
}

export { toCrc };
