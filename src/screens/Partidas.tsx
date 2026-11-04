import { useMemo, useState } from 'react';
import { ActionBar, BalanceSummary, Button, EmptyState, GroupSkeleton, ListGroup, ListRow, Loader, Menu, MenuItem, PageHeader, Progress, ProgressRing, RingRail, SummarySkeleton, TxListSkeleton } from '../ds';
import { db } from '../lib/api';
import { monthRange } from '../lib/calc';
import { buildBudget, categoryAverage, toCrc, useBudgetData, type Line, type PlanGroup } from '../lib/budget';
import { pickerOrder, rootId } from '../lib/cats';
import { amount, monthName, parseAmount, todayCR, unitOf } from '../lib/format';
import type { Currency, Tx } from '../lib/types';
import { go, navigateBack, useApp, useTxs } from '../store';
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

const byDate = (a: Tx, b: Tx) => a.occurred_at.localeCompare(b.occurred_at);
const today = () => new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10);

/** What a group of the month says under its name, and its limit (PRM-01). */
function useGroupSummary(g: PlanGroup) {
  const m = useMoney();
  const moves = [...g.recs.flatMap((s) => [...s.txs, ...s.planned]), ...g.plans.flatMap((p) => p.txs), ...g.loose].sort(byDate);
  const planned = g.recs.flatMap((s) => s.planned);
  const late = planned.filter((x) => x.occurred_at.slice(0, 10) < today());
  const coming = planned.filter((x) => x.occurred_at.slice(0, 10) >= today());
  const real = moves.filter((x) => !x.planned);
  const done = g.recs.reduce((a, s) => a + s.txs.length, 0);
  const verb = g.section === 'in' ? 'recibidos' : g.section === 'save' ? 'movidos' : 'pagados';
  const limit = g.plans.reduce((a, p) => a + p.amount, 0);
  const used = g.plans.reduce((a, p) => a + p.spent, 0);
  const pct = limit > 0 ? Math.round((used / limit) * 100) : 0;
  const noCat = g.plans.some((p) => !p.cats[0]);

  let detail: string;
  let detailTone: 'muted' | 'warning' | 'destructive' = 'muted';
  if (late.length) {
    detail = `${late.length} ${late.length === 1 ? 'atrasado' : 'atrasados'}`;
    detailTone = 'warning';
  } else if (noCat) {
    detail = 'Elegí la categoría del límite';
    detailTone = 'warning';
  } else if (limit > 0) {
    detail = used > limit ? `Te pasaste por ${m.fmt(used - limit)}` : `Gastado ${m.fmt(used)}`;
    if (used > limit) detailTone = 'destructive';
  } else if (planned.length) {
    detail = `${done} de ${done + planned.length} ${verb}`;
  } else if (moves.length) {
    detail = `${moves.length} ${moves.length === 1 ? 'movimiento' : 'movimientos'}`;
  } else {
    detail = 'Nada este mes';
  }
  const face = (size: number) => g.category ? <Emo e={g.category.emoji} color={g.category.color} size={size} />
    : g.section === 'in' ? <Emo icon="arrowDownLeft" color="mint" size={size} />
      : g.section === 'save' ? <Emo icon="piggy" color="mint" size={size} />
        : <Emo icon="envelope" size={size} />;
  return { moves, late, coming, real, limit, used, pct, detail, detailTone, face };
}

const groupHref = (g: PlanGroup) => `#/rubro/${encodeURIComponent(g.key)}`;

/** One category of the month (PRM-01): face, name, what's budgeted and, with a limit, its bar. It opens its own page. */
function Group({ g }: { g: PlanGroup }) {
  const m = useMoney();
  const s = useGroupSummary(g);
  return (
    <ListGroup className="plan-cat">
      <ListRow
        leading={s.face(40)}
        title={g.title}
        detail={s.detail}
        detailTone={s.detailTone}
        value={m.node(g.total)}
        href={groupHref(g)}
        chevron
        quiet={g.total === 0 && s.moves.length === 0}
        label={`${g.title}: ${m.fmt(g.total)} ${m.u}`}
        below={s.limit > 0 ? <Progress size="sm" value={Math.min(s.pct, 100) / 100} tone={tone(s.pct)} label={`${g.title}: ${s.pct}% usado`} /> : undefined}
      />
    </ListGroup>
  );
}

/**
 * A category of the month on its own page (#/rubro/<key>, PRM-09): what it adds up to, its limit, and its movements
 * of the month: late, coming and done. The ⋯ menu sets, edits or removes its limit.
 */
export function GroupView({ gkey }: { gkey: string }) {
  const { space, toast, bump } = useApp();
  const m = useMoney();
  const { budget, first } = useBudget();
  const [menu, setMenu] = useState(false);
  const key = decodeURIComponent(gkey);
  const g = budget && [budget.income, ...budget.groups, budget.save].find((x) => x.key === key);
  if (!space || first) return <PageSkeleton back nav={false}><TxListSkeleton /></PageSkeleton>;
  if (!g) return <div className="page no-nav"><PageHeader title="Presupuesto" onBack={navigateBack} /><EmptyState icon={<Icon name="list" size={24} />} title="No hay movimientos de esto este mes" /></div>;
  return <GroupPage g={g} menu={menu} setMenu={setMenu} m={m} toast={toast} bump={bump} />;
}

function GroupPage({ g, menu, setMenu, m, toast, bump }: { g: PlanGroup; menu: boolean; setMenu: (v: boolean) => void; m: ReturnType<typeof useMoney>; toast: (msg: string, undo?: () => unknown) => void; bump: () => void }) {
  const s = useGroupSummary(g);
  const t = todayCR();
  const month = monthName(t.m);
  const plan = g.plans[0];
  const daysLeft = new Date(Date.UTC(t.y, t.m + 1, 0)).getUTCDate() - t.d + 1;
  const pending = s.late.concat(s.coming).reduce((a, x) => a + Number(x.amount_crc), 0) + g.plans.reduce((a, p) => a + Math.max(0, p.left), 0);

  async function removeLimit() {
    setMenu(false);
    if (!plan) return;
    try {
      await db.update('envelopes', { id: plan.line.id }, { active: false });
      toast(`${g.title} ya no tiene límite`, async () => {
        await db.update('envelopes', { id: plan.line.id }, { active: true });
        bump();
      });
      bump();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  }

  const canLimit = g.section === 'out' && (g.category || plan);
  // the usual movement form, repeating, already in this category (PRM-03, PRM-09)
  const addHref = `/agregar?planear=1${g.category ? `&cat=${g.category.id}` : ''}${g.section === 'in' ? '&tipo=ingreso' : g.section === 'save' ? '&tipo=transferir' : ''}`;
  const items = [
    canLimit && !plan && g.category && { label: 'Poner límite', icon: 'envelope', run: () => (location.hash = `#/partida/nueva?cat=${g.category!.id}`) },
    plan && { label: 'Editar límite', icon: 'pencil', run: () => (location.hash = `#/partida/${plan.line.id}/editar`) },
    plan && { label: 'Quitar límite', icon: 'trash', run: removeLimit },
    { label: 'Agregar un movimiento', icon: 'plus', run: () => go(addHref) },
    g.category && { label: 'Editar la categoría', icon: 'list', run: () => (location.hash = `#/categoria/${g.category!.id}/editar`) },
  ].filter(Boolean) as { label: string; icon: string; run: () => void }[];

  const list = (title: string, txs: Tx[], note?: string) => txs.length > 0 && (
    <ListGroup title={title} note={note}>
      <div className="plan-moves">{txs.map((x) => <TxRow key={x.id} t={x} size="sheet" showDate={!x.planned} />)}</div>
    </ListGroup>
  );

  return (
    <div className="page no-nav">
      <PageHeader title={g.title} onBack={navigateBack}
        actions={(
          <span className="plan-menu-wrap">
            <Button variant="secondary" size="xs" iconOnly onClick={() => setMenu(!menu)} aria-label="Más opciones" aria-expanded={menu}><Icon name="dots" size={14} /></Button>
            {menu && (
              <>
                <span className="plan-menu-scrim" onClick={() => setMenu(false)} />
                <Menu className="plan-menu" label={`Opciones de ${g.title}`}>
                  {items.map((it) => <MenuItem key={it.label} icon={<Icon name={it.icon} size={18} />} onClick={() => { setMenu(false); it.run(); }}>{it.label}</MenuItem>)}
                </Menu>
              </>
            )}
          </span>
        )} />
      <div className="page-hero">
        {s.limit > 0 ? (
          // with a limit, what matters is what's left of it (PRM-09)
          <div className="plan-hero">
            <ProgressRing className="plan-hero-ring" size={144} thickness={10} value={s.used / s.limit} tone={tone(s.pct)} label={`${s.pct}% del límite`}>
              {g.category ? g.category.emoji : <Icon name="envelope" size={32} />}
            </ProgressRing>
            <BalanceSummary
              label={s.used > s.limit ? 'Te pasaste por' : `Quedan en ${month}`}
              value={m.fmt(Math.abs(s.limit - s.used))}
              unit={m.u}
              negative={s.used > s.limit}
              meta={`Gastado ${m.fmt(s.used)} de ${m.fmt(s.limit)} ${m.u}${s.used < s.limit && daysLeft > 1 ? ` · ${m.fmt((s.limit - s.used) / daysLeft)} por día` : ''}`}
            />
          </div>
        ) : (
          <BalanceSummary
            label={`${g.title} en ${month}`}
            value={m.fmt(g.total)}
            unit={m.u}
            meta={pending > 0 ? `Ya pasó ${m.fmt(g.real)} · falta ${m.fmt(pending)} ${m.u}` : `${s.real.length} ${s.real.length === 1 ? 'movimiento' : 'movimientos'}`}
          />
        )}
      </div>
      <div className="page-body">
        <ListGroup>
          <ListRow leading={<ListRow.Icon name="plus" />} title="Agregar un movimiento" detail="Fijo o variable, que se repite o de una vez" onClick={() => go(addHref)} />
        </ListGroup>
        {list('Atrasados', s.late)}
        {list('Vienen', s.coming)}
        {list('Este mes', [...s.real].reverse())}
        {s.moves.length === 0 && <EmptyState icon={<Icon name="list" size={24} />} title={`Sin movimientos en ${month}`} />}
      </div>
    </div>
  );
}

/** Presupuesto (menu, route #/categorias): the month written ahead, real and planned movements by category (PRM-01). */
export function Presupuesto() {
  const { space, categories } = useApp();
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

  // PRM-08: the categories with a limit, as rings that scroll sideways
  const ringItems = (b?.plans || []).map((p) => {
    const c = p.cats[0];
    // a limit without a category can't count anything yet: an empty ring that opens its editor
    if (!c) return { key: p.line.id, name: p.line.name, face: <Icon name="envelope" size={20} />, value: 0, tone: 'muted' as const, href: `#/partida/${p.line.id}/editar`, label: `${p.line.name}: elegí la categoría` };
    const pct = p.amount > 0 ? Math.round((p.spent / p.amount) * 100) : 0;
    return {
      key: p.line.id, name: c.name, face: c.emoji, value: p.amount > 0 ? p.spent / p.amount : 0, tone: tone(pct), href: `#/rubro/${encodeURIComponent(`c:${rootId(categories, c.id)}`)}`,
      label: p.left < 0 ? `${c.name}: te pasaste por ${m.fmt(-p.left)} ${m.u}` : `${c.name}: ${pct}% usado, quedan ${m.fmt(p.left)} ${m.u}`,
    };
  });
  const rings = ringItems.length > 0 && <RingRail className="plan-rings" label="Límites del mes" items={ringItems} />;

  const empty = b && !b.groups.length && !b.income.recs.length && !b.income.loose.length && !b.save.recs.length && !b.save.loose.length;
  const body = b && (
    <>
      {empty && (
        <EmptyState icon={<Icon name="list" size={24} />} title={`Planeá ${month}`} action={<Button variant="primary" size="sm" onClick={() => go('/agregar?planear=1')}>Planear</Button>}>
          Lo que entra, lo que pagás cada mes y cuánto querés gastar en súper o restaurantes.
        </EmptyState>
      )}
      {(b.income.recs.length > 0 || b.income.loose.length > 0) && <Group g={b.income} />}
      {b.groups.map((g) => <Group key={g.key} g={g} />)}
      {(b.save.recs.length > 0 || b.save.loose.length > 0) && <Group g={b.save} />}
      {!empty && (
        <ListGroup>
          <ListRow leading={<ListRow.Icon name="plus" />} title="Agregar un movimiento" onClick={() => go('/agregar?planear=1')} quiet />
        </ListGroup>
      )}
    </>
  );

  const title = `Presupuesto de ${month}`;
  if (desk) {
    return (
      <div className="dpage">
        <header className="dpage-head"><h1 className="dtitle">Presupuesto</h1><span className="muted">{month}</span></header>
        {first ? <Loader><div className="dcol gap24 dnarrow"><SummarySkeleton /><GroupSkeleton rows={5} /></div></Loader> : <div className="dcol gap24 dnarrow">{summary}{rings}{body}</div>}
      </div>
    );
  }
  return (
    <div className="page">
      <PageHeader title="Presupuesto" onMenu={menu?.open} actions={<Button variant="secondary" size="xs" iconOnly onClick={() => go('/agregar?planear=1')} aria-label="Agregar un movimiento"><Icon name="plus" size={14} /></Button>} />
      <div className="page-hero" aria-label={title}>{first ? <Loader><SummarySkeleton /></Loader> : <>{summary}{rings}</>}</div>
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

/** Add or edit an open plan (#/partida/nueva?cat=<categoría>, #/partida/<id>/editar): a category and an amount for the month (PRM-04). */
export function LineEdit({ id }: { id: string; sub?: string }) {
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
  if (!space || !data || (!isNew && !existing)) return <FormPageSkeleton title={isNew ? 'Nuevo límite' : 'Editar límite'} />;

  const lines = data.lines.filter((l) => l.active && !l.is_rest && l.kind === 'cap');
  const f = form || {
    catId: data.links.find((l) => l.envelope_id === existing?.id)?.category_id || new URLSearchParams(location.hash.split('?')[1] || '').get('cat') || '',
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
      // a category is in one plan only; a plan removed earlier can still hold it, so this takes it over
      if (!before.includes(cat.id)) await db.upsert('envelope_categories', { category_id: cat.id, envelope_id: lineId }, 'category_id');
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
      <PageHeader title={isNew ? 'Nuevo límite' : 'Editar límite'} onBack={navigateBack} />
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
