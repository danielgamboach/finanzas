import { useMemo, useState, type ReactNode } from 'react';
import { ActionBar, BalanceSummary, Button, EmptyState, Switch, GroupSkeleton, ListGroup, ListRow, Loader, Menu, MenuItem, PageHeader, Progress, ProgressRing, RingRail, SummarySkeleton, TxListSkeleton } from '../ds';
import { db } from '../lib/api';
import { monthRange } from '../lib/calc';
import { cycleRange, cycleLength } from '../lib/cycle';
import { buildBudget, categoryAverage, narrowGroup, toCrc, useBudgetData, weekAllowance, type Line, type PlanGroup } from '../lib/budget';
import { familyIds, pickerOrder, rootId } from '../lib/cats';
import { amount, monthName, parseAmount, todayCR, unitOf } from '../lib/format';
import type { Category, Currency, Tx } from '../lib/types';
import { go, navigateBack, useApp, useTxs } from '../store';
import { Emo, Icon } from '../ui';
import { CycleKickoff } from '../ui/CycleKickoff';
import { FormPageSkeleton, PageSkeleton } from '../ui/Skeletons';
import { TxRow } from '../ui/TxRow';
import { groupByDay } from './Home';
import { useDesktop } from '../lib/useDesktop';
import { useMenu } from '../lib/menu';

/** This month's plan for the current space: real and planned movements (PRM). */
export function useBudget() {
  const { space, categories, accounts, fx, cycles } = useApp();
  const t = todayCR();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = useMemo(() => cycleRange(0), [t.y, t.m, t.d, cycles.join()]);
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

const cap1 = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
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

const groupHref = (g: PlanGroup) => (g.category ? `#/categoria/${g.category.id}` : `#/rubro/${encodeURIComponent(g.key)}`);

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

/** Entra and Apartar on their own page (#/rubro/<key>); a category opens its own page (#/categoria/<id>, PRM-09). */
export function GroupView({ gkey }: { gkey: string }) {
  const { space } = useApp();
  const { budget, first } = useBudget();
  const key = decodeURIComponent(gkey);
  if (key.startsWith('c:')) {
    location.replace(`#/categoria/${key.slice(2)}`);
    return null;
  }
  const g = budget && [budget.income, ...budget.groups, budget.save].find((x) => x.key === key);
  if (!space || first) return <PageSkeleton back nav={false}><TxListSkeleton /></PageSkeleton>;
  if (!g) return <div className="page no-nav"><PageHeader title="Presupuesto" onBack={navigateBack} /><EmptyState icon={<Icon name="list" size={24} />} title="No hay movimientos de esto este mes" /></div>;
  const addHref = `/agregar?planear=1${g.section === 'in' ? '&tipo=ingreso' : g.section === 'save' ? '&tipo=transferir' : ''}`;
  return (
    <div className="page no-nav">
      <PageHeader title={g.title} onBack={navigateBack} />
      <MonthHero g={g} />
      <div className="page-body"><MonthLists g={g} addHref={addHref} /></div>
    </div>
  );
}

const addHrefFor = (g: PlanGroup, catId?: string) => `/agregar?planear=1${catId ? `&cat=${catId}` : ''}${g.section === 'in' ? '&tipo=ingreso' : g.section === 'save' ? '&tipo=transferir' : ''}`;

/** This month in a category or group: with a limit, what's left of it in a big ring; without, what it adds up to (PRM-09). */
export function MonthHero({ g, emoji, action }: { g: PlanGroup; emoji?: string; action?: ReactNode }) {
  const m = useMoney();
  const s = useGroupSummary(g);
  const t = todayCR();
  const cyc = cycleRange(0);
  const month = cyc.name;
  const inM = cyc.custom ? 'este mes' : `en ${month}`;
  const daysLeft = Math.max(1, cycleLength(cyc) - cyc.day + 1);
  const pending = g.pending;
  const { space } = useApp();
  // PRM-11: with the weekly alert, what's left of this week's share (unspent weeks roll forward)
  const weekly = g.plans.filter((p) => p.line.weekly_alert);
  const week = weekly.length ? (() => {
    const limit = weekly.reduce((a, p) => a + p.amount, 0);
    const spent = weekly.reduce((a, p) => a + p.spent, 0);
    const w = weekAllowance(limit, space?.week_start ?? 1);
    return { ...w, left: w.allowed - spent };
  })() : null;
  return (
    <div className="page-hero">
      {s.limit > 0 ? (
        <div className="plan-hero">
          <ProgressRing className="plan-hero-ring" size={144} thickness={10} value={s.used / s.limit} tone={tone(s.pct)} label={`${s.pct}% del límite`}>
            {emoji || <Icon name="envelope" size={32} />}
          </ProgressRing>
          <BalanceSummary
            label={s.used > s.limit ? 'Te pasaste por' : cap1(`disponible ${inM}`)}
            value={m.fmt(Math.abs(s.limit - s.used))}
            unit={m.u}
            negative={s.used > s.limit}
            meta={`Gastado ${m.fmt(s.used)} de ${m.fmt(s.limit)} ${m.u}${s.used < s.limit && daysLeft > 1 ? ` · ${m.fmt((s.limit - s.used) / daysLeft)} por día` : ''}`}
            action={action}
          />
          {week && (
            <p className={week.left < 0 ? 'plan-week is-over' : 'plan-week'}>
              {week.left < 0 ? `Esta semana te pasaste por ${m.fmt(-week.left)} ${m.u}` : `Esta semana te quedan ${m.fmt(week.left)} ${m.u}`}
              <span> · semana {week.week}, hasta {m.fmt(week.allowed)} {m.u}</span>
            </p>
          )}
        </div>
      ) : (
        <BalanceSummary
          label={cap1(g.section === 'in' ? `entra ${inM}` : g.section === 'save' ? `apartado ${inM}` : `gastado ${inM}`)}
          value={m.fmt(g.real)}
          unit={m.u}
          meta={pending > 0 ? `Falta ${m.fmt(pending)} ${m.u} · ${m.fmt(g.total)} en total` : `${s.real.length} ${s.real.length === 1 ? 'movimiento' : 'movimientos'}`}
          action={action}
        />
      )}
    </div>
  );
}

/** Late, coming and done this month, and adding a movement (PRM-09). */
export function MonthLists({ g, addHref }: { g: PlanGroup; addHref: string }) {
  const s = useGroupSummary(g);
  const cyc = cycleRange(0);
  const inM = cyc.custom ? 'este mes' : `en ${cyc.name}`;
  const list = (title: string, txs: Tx[]) => txs.length > 0 && (
    <ListGroup title={title}>
      <div className="plan-moves">{txs.map((x) => <TxRow key={x.id} t={x} size="sheet" showDate={!x.planned} />)}</div>
    </ListGroup>
  );
  return (
    <>
      {list('Atrasados', s.late)}
      {list('Vienen', s.coming)}
      {list('Este mes', [...s.real].reverse())}
      {s.moves.length === 0 && <EmptyState icon={<Icon name="list" size={24} />} title={`Sin movimientos ${inM}`} />}
      <ListGroup>
        <ListRow leading={<ListRow.Icon name="plus" />} title="Agregar un movimiento" detail="Fijo o variable, que se repite o de una vez" onClick={() => go(addHref)} quiet />
      </ListGroup>
    </>
  );
}

/** A category's budget this month, seen from that category and its subcategories (PRM-09). */
export function useCategoryMonth(cat: Category | undefined, fam: Set<string>) {
  const { categories } = useApp();
  const { budget, first } = useBudget();
  let g: PlanGroup | null = null;
  if (budget && cat) {
    const base = cat.kind === 'income' ? budget.income : budget.groups.find((x) => x.key === `c:${rootId(categories, cat.id)}`);
    if (base) g = narrowGroup(base, fam);
  }
  return { g, first, addHref: g && cat ? addHrefFor(g, cat.id) : '' };
}

/** The ⋯ of a category: its limit, adding a movement and editing it (PRM-09). */
export function CategoryMenu({ cat, g }: { cat: Category; g: PlanGroup | null }) {
  const { toast, bump } = useApp();
  const [open, setOpen] = useState(false);
  const plan = g?.plans.find((p) => p.cats.some((c) => c.id === cat.id));

  async function removeLimit() {
    if (!plan) return;
    try {
      await db.update('envelopes', { id: plan.line.id }, { active: false });
      toast(`${cat.name} ya no tiene límite`, async () => {
        await db.update('envelopes', { id: plan.line.id }, { active: true });
        bump();
      });
      bump();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  }

  const items = [
    cat.kind === 'expense' && !plan && { label: 'Poner límite', icon: 'envelope', run: () => (location.hash = `#/partida/nueva?cat=${cat.id}`) },
    plan && { label: 'Editar límite', icon: 'pencil', run: () => (location.hash = `#/partida/${plan.line.id}/editar`) },
    plan && { label: 'Quitar límite', icon: 'trash', run: removeLimit },
    g && { label: 'Agregar un movimiento', icon: 'plus', run: () => go(addHrefFor(g, cat.id)) },
    { label: 'Editar la categoría', icon: 'list', run: () => go(`/categoria/${cat.id}/editar`) },
  ].filter(Boolean) as { label: string; icon: string; run: () => void }[];

  return (
    <span className="plan-menu-wrap">
      <Button variant="secondary" size="xs" iconOnly onClick={() => setOpen(!open)} aria-label="Más opciones" aria-expanded={open}><Icon name="dots" size={14} /></Button>
      {open && (
        <>
          <span className="plan-menu-scrim" onClick={() => setOpen(false)} />
          <Menu className="plan-menu" label={`Opciones de ${cat.name}`}>
            {items.map((it) => <MenuItem key={it.label} icon={<Icon name={it.icon} size={18} />} onClick={() => { setOpen(false); it.run(); }}>{it.label}</MenuItem>)}
          </Menu>
        </>
      )}
    </span>
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
  const cyc = cycleRange(0);
  const month = cyc.custom ? 'este mes' : cyc.name;
  const inM = cyc.custom ? 'este mes' : `en ${cyc.name}`;

  const summary = b && (
    <BalanceSummary
      label={b.free < 0 ? cap1(`te pasás ${inM}`) : cap1(`libre ${inM}`)}
      value={m.fmt(Math.abs(b.free))}
      unit={m.u}
      negative={b.free < 0}
      meta={`Entra ${m.fmt(b.entra)} · sale ${m.fmt(b.sale)}${b.aparta ? ` · apartás ${m.fmt(b.aparta)}` : ''} ${m.u}`}
    />
  );

  // PRM-08: every category or subcategory with a limit as a ring, sideways: how much of the limit is used
  const ringItems = !b ? [] : [
    ...pickerOrder(categories.filter((c) => c.kind === 'expense' && !c.archived && c.space_id === space.id))
      .filter((c) => b.plans.some((x) => x.cats.some((k) => k.id === c.id)))
      .map((c) => {
      const root = b.groups.find((x) => x.key === `c:${rootId(categories, c.id)}`);
      const g = root ? narrowGroup(root, familyIds(categories, c.id)) : null;
      const p = b.plans.find((x) => x.cats.some((k) => k.id === c.id));
      const href = `#/categoria/${c.id}`;
      if (p) {
        const pct = p.amount > 0 ? Math.round((p.spent / p.amount) * 100) : 0;
        return {
          key: c.id, name: c.name, face: c.emoji, value: p.amount > 0 ? p.spent / p.amount : 0, tone: tone(pct), href,
          label: p.left < 0 ? `${c.name}: te pasaste por ${m.fmt(-p.left)} ${m.u}` : `${c.name}: ${pct}% usado, quedan ${m.fmt(p.left)} ${m.u}`,
        };
      }
      const total = g?.total || 0, real = g?.real || 0;
      return {
        key: c.id, name: c.name, face: c.emoji, value: g && g.pending > 0 && total > 0 ? real / total : 0, tone: 'default' as const, href,
        label: `${c.name}: ${m.fmt(real)} ${m.u} este mes${g && g.pending > 0 ? `, faltan ${m.fmt(g.pending)}` : ''}`,
      };
    }),
    // a limit without a category can't count anything yet: an empty ring that opens its editor
    ...b.plans.filter((p) => !p.cats[0]).map((p) => ({ key: p.line.id, name: p.line.name, face: <Icon name="envelope" size={20} />, value: 0, tone: 'muted' as const, href: `#/partida/${p.line.id}/editar`, label: `${p.line.name}: elegí la categoría` })),
  ];
  const rings = ringItems.length > 0 && <RingRail className="plan-rings" label="Categorías del mes" items={ringItems} />;

  const empty = b && !b.groups.length && !b.income.recs.length && !b.income.loose.length && !b.save.recs.length && !b.save.loose.length;
  const body = b && (
    <>
      {empty && (
        <EmptyState icon={<Icon name="list" size={24} />} title={cyc.custom ? 'Planeá este mes' : `Planeá ${month}`} action={<Button variant="primary" size="sm" onClick={() => go('/agregar?planear=1')}>Planear</Button>}>
          Lo que entra, lo que pagás cada mes y cuánto querés gastar en súper o restaurantes.
        </EmptyState>
      )}
      {(b.income.recs.length > 0 || b.income.loose.length > 0) && <Group g={b.income} />}
      {b.groups.map((g) => <Group key={g.key} g={g} />)}
      {(b.save.recs.length > 0 || b.save.loose.length > 0) && <Group g={b.save} />}
      <ListGroup>
        {!empty && <ListRow leading={<ListRow.Icon name="plus" />} title="Agregar un movimiento" onClick={() => go('/agregar?planear=1')} quiet />}
        <ListRow leading={<ListRow.Icon name="plus" />} title="Nueva categoría" href="#/categoria/nueva" quiet />
      </ListGroup>
    </>
  );

  const title = `Presupuesto de ${month}`;
  if (desk) {
    return (
      <div className="dpage">
        <header className="dpage-head"><h1 className="dtitle">Presupuesto</h1><span className="muted">{month}</span></header>
        {first ? <Loader><div className="dcol gap24 dnarrow"><SummarySkeleton /><GroupSkeleton rows={5} /></div></Loader> : <div className="dcol gap24 dnarrow">{summary}<CycleKickoff />{rings}{body}</div>}
      </div>
    );
  }
  return (
    <div className="page">
      <PageHeader title="Presupuesto" onMenu={menu?.open} actions={<Button variant="secondary" size="xs" iconOnly onClick={() => go('/agregar?planear=1')} aria-label="Agregar un movimiento"><Icon name="plus" size={14} /></Button>} />
      <div className="page-hero" aria-label={title}>{first ? <Loader><SummarySkeleton /></Loader> : <>{summary}{rings}</>}</div>
      <div className="page-body">{first ? <Loader><GroupSkeleton rows={5} /></Loader> : <><CycleKickoff />{body}</>}</div>
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
  const cyc = cycleRange(0);
  const days = Math.max(1, cycleLength(cyc) - cyc.day + 1);
  const pace = p.left > 0 && days > 1 ? ` · ${m.fmt(p.left / days)} ${m.u} por día` : '';
  const groups = groupByDay(p.txs);
  const name = p.cats[0]?.name || p.line.name;
  return (
    <div className="page no-nav">
      <PageHeader title={name} onBack={navigateBack}
        actions={<Button variant="secondary" size="xs" iconOnly onClick={() => (location.hash = `#/partida/${id}/editar`)} aria-label="Editar plan"><Icon name="pencil" size={14} /></Button>} />
      <div className="page-hero">
        <BalanceSummary
          label={p.left < 0 ? 'Te pasaste por' : cyc.custom ? 'Quedan este mes' : `Quedan en ${cyc.name}`}
          value={m.fmt(Math.abs(p.left))}
          unit={m.u}
          negative={p.left < 0}
          meta={`de ${m.fmt(p.amount)} ${m.u} · ${days === 1 ? 'último día' : `${days} días`}${pace}`}
        />
      </div>
      <div className="page-body">
        {groups.length === 0 ? (
          <EmptyState icon={<Icon name="list" size={24} />} title={cyc.custom ? 'Sin gastos este mes' : `Sin gastos en ${cyc.name}`} />
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
  const [form, setForm] = useState<null | { catId: string; amt: string; currency: Currency; weekly: boolean }>(null);
  const [busy, setBusy] = useState(false);
  if (!space || !data || (!isNew && !existing)) return <FormPageSkeleton title={isNew ? 'Nuevo límite' : 'Editar límite'} />;

  const lines = data.lines.filter((l) => l.active && !l.is_rest && l.kind === 'cap');
  const f = form || {
    catId: data.links.find((l) => l.envelope_id === existing?.id)?.category_id || new URLSearchParams(location.hash.split('?')[1] || '').get('cat') || '',
    amt: existing?.amount ? typed(Number(existing.amount)) : '',
    currency: existing?.currency || cur,
    weekly: !!existing?.weekly_alert,
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
      const row = { name: cat.name, amount: Math.round(num * 100) / 100, currency: f.currency, weekly_alert: f.weekly, kind: 'cap', period: 'monthly', recurring_id: null, group_category_id: null, amount_auto: false, account_id: null };
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
        <div className="field-card">
          <div className="field-row plan-week-row">
            <span className="col gap4">
              <span>Avisarme por semana</span>
              <small>{num > 0
                ? `Cada semana te tocan ${amount(num / 4.3, f.currency, 1)} ${unitOf(f.currency)} (el límite entre 4,3). Lo que no gastés una semana pasa a la siguiente. Te avisamos si te pasás.`
                : 'Cada semana te toca el límite entre 4,3, y lo que no gastés pasa a la siguiente.'}</small>
            </span>
            <Switch checked={f.weekly} label="Avisarme por semana" onChange={() => set({ weekly: !f.weekly })} />
          </div>
        </div>
        <p className="page-text">Te avisamos al llegar al 80% del mes y si te pasás.</p>
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
