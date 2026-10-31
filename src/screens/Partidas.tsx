import { useMemo, useState } from 'react';
import { ActionBar, BalanceSummary, Button, Checkbox, EmptyState, GroupSkeleton, ListGroup, ListRow, Loader, PageHeader, Progress, SummarySkeleton, Switch, TxListSkeleton } from '../ds';
import { db } from '../lib/api';
import { monthRange } from '../lib/calc';
import { buildBudget, GROUP_LABEL, KIND_LABEL, monthKeyNow, nextDueForDay, toCrc, useBudgetData, type LineKind, type LineStat, type Line } from '../lib/budget';
import { familyIds } from '../lib/cats';
import { amount, monthName, parseAmount, todayCR, unitOf } from '../lib/format';
import { daysUntil, shortDay } from '../lib/recurring';
import { canPay } from '../lib/transfers';
import type { Currency } from '../lib/types';
import { navigateBack, useApp, useTxs } from '../store';
import { Emo, Icon, Segmented } from '../ui';
import { FormPageSkeleton, PageSkeleton } from '../ui/Skeletons';
import { TxRow } from '../ui/TxRow';
import { groupByDay } from './Home';
import { useDesktop } from '../lib/useDesktop';
import { useMenu } from '../lib/menu';

/** This month's budget for the current space. */
export function useBudget() {
  const { space, categories, fx } = useApp();
  const t = todayCR();
  const range = useMemo(() => monthRange(t.y, t.m), [t.y, t.m]);
  const { txs, loading } = useTxs(range);
  const data = useBudgetData(space?.id);
  const budget = data && space ? buildBudget({ ...data, categories, txs, spaceId: space.id, fx }) : null;
  return { budget, data, first: (loading && txs.length === 0) || !data };
}

const tone = (pct: number) => (pct >= 100 ? 'destructive' : pct >= 80 ? 'warning' : 'default') as 'destructive' | 'warning' | 'default';
const money = (v: number, cur: Currency, fx: number) => <>{amount(v, cur, fx)}<span className="amt-unit"> {unitOf(cur)}</span></>;

/** The face of a line: its category's emoji when there is one, an icon of its kind otherwise. */
function Face({ s }: { s: LineStat }) {
  const { categories } = useApp();
  const c = s.line.kind === 'cap' ? (s.cats.length === 1 ? s.cats[0] : null)
    : s.line.kind === 'fixed' ? categories.find((x) => x.id === (s.line.group_category_id || s.recs[0]?.r.category_id)) : null;
  if (c) return <Emo e={c.emoji} color={c.color} size={40} />;
  return <Emo icon={s.line.kind === 'saving' ? 'piggy' : s.line.kind === 'fixed' ? 'calendar' : 'envelope'} color={s.line.kind === 'saving' ? 'mint' : undefined} size={40} />;
}

/** A fixed payment: due or paid this month (PPT-02). */
function FixedRow({ s }: { s: LineStat }) {
  const { cur, fx } = useApp();
  let detail = 'No se paga este mes', detailTone: 'muted' | 'success' | 'warning' = 'muted';
  if (s.recs.length > 1) {
    const paid = s.recs.filter((x) => x.paidOn && !x.dueOn).length;
    detail = `${paid} de ${s.recs.length} pagados`;
    if (s.done) detailTone = 'success';
  } else if (s.recs.length === 1) {
    const r = s.recs[0];
    if (r.dueOn) {
      const late = daysUntil(r.dueOn) < 0;
      detail = `${late ? 'Venció' : 'Vence'} el ${shortDay(r.dueOn)}`;
      if (late) detailTone = 'warning';
    } else if (r.paidOn) {
      detail = `Pagado el ${shortDay(r.paidOn)}`;
      detailTone = 'success';
    }
  }
  return (
    <ListRow
      leading={<Face s={s} />}
      title={s.line.name}
      detail={detail}
      detailTone={detailTone}
      value={money(s.amount, cur, fx)}
      valueTone={s.done ? 'muted' : 'default'}
      href={`#/partida/${s.line.id}/editar`}
      chevron
    />
  );
}

/** A cap: what's left of it this month, with its bar (PPT-03). */
function CapRow({ s }: { s: LineStat }) {
  const { cur, fx } = useApp();
  const u = unitOf(cur);
  const pct = s.amount > 0 ? Math.round((s.actual / s.amount) * 100) : 0;
  const over = s.left! < 0;
  return (
    <ListRow
      leading={<Face s={s} />}
      title={s.line.name}
      detail={over ? `Te pasaste por ${amount(-s.left!, cur, fx)} ${u}` : `Quedan ${amount(s.left!, cur, fx)} de ${amount(s.amount, cur, fx)} ${u}`}
      detailTone={over ? 'destructive' : 'muted'}
      value={`${pct}%`}
      valueTone={tone(pct)}
      href={`#/partida/${s.line.id}`}
      chevron
      label={`${s.line.name}: quedan ${amount(s.left!, cur, fx)} de ${amount(s.amount, cur, fx)} ${u}`}
      below={<Progress size="sm" value={Math.min(pct, 100) / 100} tone={tone(pct)} label={`${s.line.name}: ${pct}% usado`} />}
    />
  );
}

/** Money to set apart: done when it reaches its account, or with "Aparté" (PPT-04). */
function SavingRow({ s }: { s: LineStat }) {
  const { cur, fx, accounts, toast, bump } = useApp();
  const acc = accounts.find((a) => a.id === s.line.account_id);
  const ask = !s.done && !acc && s.actual === 0;
  async function mark() {
    try {
      await db.upsert('envelope_marks', { envelope_id: s.line.id, month: monthKeyNow() }, 'envelope_id,month');
      toast(`${s.line.name}: apartado`, () => db.remove('envelope_marks', { envelope_id: s.line.id, month: monthKeyNow() }));
      bump();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  }
  const u = unitOf(cur);
  return (
    <ListRow
      leading={<Face s={s} />}
      title={s.line.name}
      detail={s.done ? (acc ? `Apartado en ${acc.name}` : 'Apartado') : ask ? `${amount(s.amount, cur, fx)} ${u} · por apartar` : acc ? (s.actual > 0 ? `Faltan ${amount(s.amount - s.actual, cur, fx)} ${u}` : `Por mover a ${acc.name}`) : 'Por apartar'}
      detailTone={s.done ? 'success' : 'muted'}
      value={ask ? undefined : money(s.amount, cur, fx)}
      actions={ask ? <Button variant="secondary" size="xs" onClick={mark}>Aparté</Button> : undefined}
      href={`#/partida/${s.line.id}/editar`}
      chevron
      label={s.line.name}
    />
  );
}

const ROWS: Record<LineKind, (p: { s: LineStat }) => JSX.Element> = { fixed: FixedRow, cap: CapRow, saving: SavingRow };

/** Presupuesto (menu, route #/categorias): the month's lines, like a spreadsheet (PPT-07). */
export function Presupuesto() {
  const { space, cur, fx } = useApp();
  const desk = useDesktop();
  const menu = useMenu();
  const [editIncome, setEditIncome] = useState(false);
  const { budget, data, first } = useBudget();
  if (!space) return <PageSkeleton title="Presupuesto"><GroupSkeleton rows={5} /></PageSkeleton>;
  const u = unitOf(cur);
  const t = todayCR();
  const b = budget;

  const summary = b && (b.free != null ? (
    <BalanceSummary
      label={b.free < 0 ? 'Presupuestaste de más' : 'Te queda libre'}
      value={amount(Math.abs(b.free), cur, fx)}
      unit={u}
      negative={b.free < 0}
      meta={`Salario ${amount(b.income!, cur, fx)} · presupuestado ${amount(b.budgeted, cur, fx)} ${u}`}
      action={<Button variant="secondary" size="xs" onClick={() => setEditIncome(true)}>Salario</Button>}
    />
  ) : (
    <BalanceSummary
      label="Presupuestado"
      value={amount(b.budgeted, cur, fx)}
      unit={u}
      meta={`${b.lines.length} ${b.lines.length === 1 ? 'partida' : 'partidas'}`}
      action={<Button variant="secondary" size="xs" onClick={() => setEditIncome(true)}>Agregar salario</Button>}
    />
  ));

  const body = b && (
    <>
      {b.lines.length === 0 && (
        <EmptyState icon={<Icon name="list" size={24} />} title="Armá tu presupuesto" action={<Button variant="primary" size="sm" onClick={() => (location.hash = '#/partida/nueva')}>Agregar partida</Button>}>
          Alquiler, restaurantes, ahorro: lo que pensás gastar o apartar cada mes.
        </EmptyState>
      )}
      {(['fixed', 'cap', 'saving'] as LineKind[]).map((k) => b.byKind[k].length > 0 && (
        <ListGroup key={k} title={GROUP_LABEL[k]} action={<span className="plan-total">{amount(b.total[k], cur, fx)} {u}</span>}>
          {b.byKind[k].map((s) => {
            const Row = ROWS[k];
            return <Row key={s.line.id} s={s} />;
          })}
        </ListGroup>
      ))}
      {b.lines.length > 0 && (
        <ListGroup>
          <ListRow leading={<Icon name="plus" size={16} />} title="Agregar partida" href="#/partida/nueva" quiet />
        </ListGroup>
      )}
    </>
  );

  const income = editIncome && data && <IncomeEditor current={data.settings} onClose={() => setEditIncome(false)} />;
  const title = `Presupuesto de ${monthName(t.m)}`;

  if (desk) {
    return (
      <div className="dpage">
        <header className="dpage-head"><h1 className="dtitle">Presupuesto</h1><span className="muted">{monthName(t.m)}</span></header>
        {first ? <Loader><div className="dcol gap24 dnarrow"><SummarySkeleton /><GroupSkeleton rows={5} /></div></Loader> : <div className="dcol gap24 dnarrow">{income || summary}{body}</div>}
      </div>
    );
  }
  return (
    <div className="page">
      <PageHeader title="Presupuesto" onMenu={menu?.open} actions={<Button variant="secondary" size="xs" iconOnly onClick={() => (location.hash = '#/partida/nueva')} aria-label="Agregar partida"><Icon name="plus" size={14} /></Button>} />
      <div className="page-hero" aria-label={title}>{first ? <Loader><SummarySkeleton /></Loader> : income || summary}</div>
      <div className="page-body">{first ? <Loader><GroupSkeleton rows={5} /></Loader> : body}</div>
    </div>
  );
}

/** The salary, typed once and repeated every month (PPT-05). Inline, in place of the summary. */
function IncomeEditor({ current, onClose }: { current: { income: number | null; currency: Currency } | null; onClose: () => void }) {
  const { space, cur, toast, bump } = useApp();
  const [val, setVal] = useState(current?.income ? typed(Number(current.income)) : '');
  const [currency, setCurrency] = useState<Currency>(current?.currency || cur);
  const [busy, setBusy] = useState(false);
  async function save(income: number | null) {
    if (!space) return;
    setBusy(true);
    try {
      await db.upsert('budget_settings', { space_id: space.id, income, currency }, 'space_id');
      toast(income == null ? 'Salario quitado' : 'Salario guardado');
      bump();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }
  const num = parseAmount(val);
  return (
    <div className="col gap10">
      <span className="field-label">Salario del mes</span>
      <div className="field-card">
        <label className="field-row">
          <span>Monto</span>
          <input inputMode="decimal" value={val} autoFocus onChange={(e) => setVal(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="0" aria-label="Salario del mes" />
        </label>
        <label className="field-row">
          <span>Moneda</span>
          <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} aria-label="Moneda">
            <option value="CRC">Colones</option>
            <option value="USD">Dólares</option>
          </select>
        </label>
      </div>
      <p className="page-text">Se repite cada mes. Si cambia, lo editás aquí.</p>
      <div className="row gap10">
        <Button variant="primary" size="sm" disabled={busy || !(num > 0)} onClick={() => save(Math.round(num * 100) / 100)}>Guardar</Button>
        <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>Cancelar</Button>
        {current?.income != null && <Button variant="ghost" size="sm" className="danger" disabled={busy} onClick={() => save(null)}>Quitar</Button>}
      </div>
    </div>
  );
}

/** A cap (#/partida/<id>): what's left, the pace, its categories and this month's movements. Other lines open the editor. */
export function LineView({ id }: { id: string }) {
  const { space, cur, fx } = useApp();
  const { budget, first } = useBudget();
  const s = budget?.lines.find((x) => x.line.id === id);
  if (!space || first) return <PageSkeleton back nav={false}><TxListSkeleton /></PageSkeleton>;
  if (!s) return <div className="page no-nav"><PageHeader title="Presupuesto" onBack={navigateBack} /><EmptyState icon={<Icon name="list" size={24} />} title="Esa partida ya no existe" /></div>;
  if (s.line.kind !== 'cap') {
    location.replace(`#/partida/${id}/editar`);
    return null;
  }
  const u = unitOf(cur);
  const t = todayCR();
  const days = new Date(Date.UTC(t.y, t.m + 1, 0)).getUTCDate() - t.d + 1;
  const pace = s.left! > 0 && days > 1 ? ` · ${amount(s.left! / days, cur, fx)} ${u} por día` : '';
  const groups = groupByDay(s.txs);
  return (
    <div className="page no-nav">
      <PageHeader title={s.line.name} onBack={navigateBack}
        actions={<Button variant="secondary" size="xs" iconOnly onClick={() => (location.hash = `#/partida/${id}/editar`)} aria-label="Editar partida"><Icon name="pencil" size={14} /></Button>} />
      <div className="page-hero">
        <BalanceSummary
          label={s.left! < 0 ? 'Te pasaste por' : `Quedan en ${monthName(t.m)}`}
          value={amount(Math.abs(s.left!), cur, fx)}
          unit={u}
          negative={s.left! < 0}
          meta={`de ${amount(s.amount, cur, fx)} ${u} · ${days === 1 ? 'último día' : `${days} días`}${pace}`}
        />
      </div>
      <div className="page-body">
        <ListGroup title="Categorías" action={<a href={`#/partida/${id}/editar`}>Cambiar</a>}>
          {s.cats.length === 0 ? <div className="group-pad page-text">Elegí qué categorías cuentan en este tope.</div> : s.cats.map((c) => (
            <ListRow key={c.id} leading={<Emo e={c.emoji} color={c.color} size={40} />} title={c.name} href={`#/categoria/${c.id}`} chevron />
          ))}
        </ListGroup>
        {groups.length === 0 ? (
          <EmptyState icon={<Icon name="list" size={24} />} title={`Sin gastos en ${monthName(t.m)}`} />
        ) : (
          <div className="mb-flat">
            {groups.map((g) => (
              <section key={g.label} className="mb-day">
                <div className="mb-day-head row between"><span>{g.label}</span>{g.total !== 0 && <span>{amount(g.total, cur, fx)} {u}</span>}</div>
                {g.rows.map((x) => <TxRow key={x.id} t={x} size="sheet" />)}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Add or edit a line (#/partida/nueva, #/partida/<id>/editar): the kind first, then only what that kind needs (PPT-01). */
export function LineEdit({ id }: { id: string }) {
  const { space, categories, accounts, cur, fx, toast, bump } = useApp();
  const { data } = useBudget();
  const isNew = id === 'nueva';
  const existing = data?.lines.find((l) => l.id === id) || null;
  const rec = existing?.recurring_id ? data?.recurring.find((r) => r.id === existing.recurring_id) : undefined;
  const [form, setForm] = useState<null | { kind: LineKind; name: string; amt: string; currency: Currency; day: string; catId: string; group: boolean; cats: Set<string>; accountId: string }>(null);
  const [busy, setBusy] = useState(false);
  if (!space || !data || (!isNew && !existing)) return <FormPageSkeleton title={isNew ? 'Nueva partida' : 'Editar partida'} />;

  const f = form || {
    kind: existing?.kind || 'fixed',
    name: existing?.name || '',
    amt: existing?.amount ? typed(Number(existing.amount)) : '',
    currency: existing?.currency || cur,
    day: rec ? String(Number(rec.next_due.slice(8, 10))) : '',
    catId: existing?.group_category_id || rec?.category_id || '',
    group: !!existing?.group_category_id,
    cats: new Set(data.links.filter((l) => existing && l.envelope_id === existing.id).map((l) => l.category_id)),
    accountId: existing?.account_id || '',
  };
  const set = (p: Partial<typeof f>) => setForm({ ...f, ...p });
  const num = parseAmount(f.amt);
  const expenseRoots = categories.filter((c) => c.kind === 'expense' && !c.archived && !c.parent_id).sort((a, b) => a.sort - b.sort);
  const expenseAll = categories.filter((c) => c.kind === 'expense' && !c.archived);
  const kidsOf = (pid: string) => categories.filter((c) => c.parent_id === pid && !c.archived).sort((a, b) => a.sort - b.sort);
  const lines = data.lines.filter((l) => l.active && !l.is_rest);
  const owner = new Map(data.links.filter((l) => l.envelope_id !== existing?.id && lines.some((x) => x.id === l.envelope_id && x.kind === 'cap')).map((l) => [l.category_id, lines.find((x) => x.id === l.envelope_id)!.name]));

  // a group of recurrents (Suscripciones): suggest what they add up to in a month
  const groupRecs = f.group && f.catId ? data.recurring.filter((r) => r.active && r.kind === 'expense' && r.category_id && familyIds(categories, f.catId).has(r.category_id)) : [];
  const groupSum = groupRecs.reduce((a, r) => a + toCrc(r.amount, r.currency, fx), 0);
  const inCur = (crc: number) => (f.currency === 'USD' ? crc / fx : crc);

  const day = Math.round(Number(f.day));
  const valid = f.name.trim() && num > 0
    && (f.kind !== 'fixed' || (f.group ? !!f.catId : day >= 1 && day <= 31))
    && (f.kind !== 'cap' || f.cats.size > 0);

  const toggle = (cid: string) => {
    const next = new Set(f.cats);
    if (next.has(cid)) next.delete(cid);
    else {
      next.add(cid);
      kidsOf(cid).forEach((k) => next.delete(k.id));
    }
    set({ cats: next });
  };

  async function save() {
    if (!space || !valid) return;
    setBusy(true);
    try {
      const amt = Math.round(num * 100) / 100;
      let recurringId = existing?.recurring_id || null;
      // a single fixed payment is a recurrent: created or updated here, so it keeps showing in Pagos pendientes (PPT-02)
      if (f.kind === 'fixed' && !f.group) {
        const recRow: Record<string, unknown> = { merchant: f.name.trim(), amount: amt, currency: f.currency, category_id: f.catId || null };
        if (!rec || Number(rec.next_due.slice(8, 10)) !== day) recRow.next_due = nextDueForDay(day);
        if (rec) await db.update('recurring', { id: rec.id }, recRow);
        else {
          const made = await db.insert<{ id: string }>('recurring', { ...recRow, space_id: space.id, kind: 'expense', frequency: 'monthly', method: 'transfer', auto: false, active: true, next_due: nextDueForDay(day) });
          recurringId = made[0].id;
        }
      }
      const row = {
        name: f.name.trim(), amount: amt, currency: f.currency, kind: f.kind, period: 'monthly',
        recurring_id: f.kind === 'fixed' && !f.group ? recurringId : null,
        group_category_id: f.kind === 'fixed' && f.group ? f.catId : null,
        account_id: f.kind === 'saving' ? f.accountId || null : null,
      };
      let lineId = existing?.id;
      if (lineId) await db.update('envelopes', { id: lineId }, row);
      else lineId = (await db.insert<Line>('envelopes', { ...row, space_id: space.id, sort: lines.length + 1 }))[0].id;
      // only a cap has categories
      const before = new Set(data!.links.filter((l) => l.envelope_id === lineId).map((l) => l.category_id));
      const want = f.kind === 'cap' ? f.cats : new Set<string>();
      for (const c of before) if (!want.has(c)) await db.remove('envelope_categories', { category_id: c });
      const add = [...want].filter((c) => !before.has(c));
      if (add.length) await db.insert('envelope_categories', add.map((c) => ({ category_id: c, envelope_id: lineId })));
      toast(isNew ? 'Partida agregada' : 'Partida guardada');
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
      toast(existing.recurring_id ? `${existing.name} borrada · el pago sigue en Recurrentes` : `${existing.name} borrada`, () => db.update('envelopes', { id: existing.id }, { active: true }));
      bump();
      location.hash = '#/categorias';
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo borrar');
    }
  }

  const payable = accounts.filter((a) => !a.archived && a.kind !== 'credit_card' && a.kind !== 'loan' && a.system !== 'cash');
  return (
    <div className="page no-nav">
      <PageHeader title={isNew ? 'Nueva partida' : 'Editar partida'} onBack={navigateBack} />
      <div className="page-body">
        {isNew && <Segmented value={f.kind} options={[['fixed', 'Pago fijo'], ['cap', 'Tope'], ['saving', 'Ahorro']]} onChange={(v) => set({ kind: v })} />}
        <p className="page-text">
          {f.kind === 'fixed' ? 'Algo que pagás cada mes por el mismo monto: alquiler, internet, suscripciones.'
            : f.kind === 'cap' ? 'Lo máximo que querés gastar al mes en algo: restaurantes, súper, salidas.'
              : 'Lo que querés separar cada mes: emergencias, inversión, una meta.'}
        </p>
        <div className="field-card">
          <label className="field-row">
            <span>Nombre</span>
            <input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder={f.kind === 'fixed' ? 'Alquiler de la casa' : f.kind === 'cap' ? 'Restaurantes' : 'Emergencias'} aria-label="Nombre" />
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

          {f.kind === 'fixed' && !f.group && (
            <label className="field-row">
              <span>Se paga el día</span>
              <input inputMode="numeric" value={f.day} onChange={(e) => set({ day: e.target.value.replace(/\D/g, '').slice(0, 2) })} placeholder="1 a 31" aria-label="Día del mes" />
            </label>
          )}
          {f.kind === 'fixed' && (
            <label className="field-row">
              <span>Categoría</span>
              <select value={f.catId} onChange={(e) => set({ catId: e.target.value })} aria-label="Categoría">
                <option value="">{f.group ? 'Elegí una' : 'Ninguna'}</option>
                {expenseAll.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
              </select>
            </label>
          )}
          {f.kind === 'fixed' && isNew && (
            <div className="field-row">
              <span className="col"><span>Varios pagos de una categoría</span><small>Por ejemplo, todas tus suscripciones juntas</small></span>
              <Switch checked={f.group} label="Varios pagos de una categoría" onChange={() => set({ group: !f.group })} />
            </div>
          )}

          {f.kind === 'saving' && (
            <label className="field-row">
              <span>Va a la cuenta</span>
              <select value={f.accountId} onChange={(e) => set({ accountId: e.target.value })} aria-label="Cuenta">
                <option value="">Ninguna (lo marco a mano)</option>
                {payable.filter((a) => canPay(a) || a.kind === 'savings' || a.kind === 'investment').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          )}
        </div>

        {f.kind === 'fixed' && !f.group && <p className="page-text">Se agrega a Recurrentes, así te avisa en Pagos pendientes cuando toca pagarlo.</p>}
        {f.kind === 'fixed' && f.group && f.catId && (
          groupRecs.length === 0 ? <p className="page-text">Esa categoría no tiene pagos recurrentes todavía.</p> : (
            <div className="row between gap10 env-sug">
              <span className="page-text">{groupRecs.length} {groupRecs.length === 1 ? 'pago suma' : 'pagos suman'} {amount(groupSum, f.currency, fx)} {unitOf(f.currency)} al mes</span>
              <Button variant="secondary" size="xs" onClick={() => set({ amt: typed(Math.round(inCur(groupSum) * 100) / 100) })}>Usar</Button>
            </div>
          )
        )}
        {f.kind === 'saving' && f.accountId && <p className="page-text">Queda apartado cuando movés el dinero a esa cuenta.</p>}

        {f.kind === 'cap' && (
          <ListGroup title="Qué gastos cuentan" note="Una categoría solo puede estar en un tope. La principal incluye sus subcategorías.">
            {expenseRoots.map((c) => {
              const taken = owner.get(c.id);
              const kids = kidsOf(c.id);
              const kidTaken = kids.find((k) => owner.has(k.id));
              const on = f.cats.has(c.id);
              const blocked = !!taken || (!!kidTaken && !on);
              return (
                <div key={c.id}>
                  <ListRow
                    leading={<Emo e={c.emoji} color={c.color} size={40} />}
                    title={c.name}
                    detail={taken ? `En ${taken}` : kidTaken && !on ? `${kidTaken.name} está en ${owner.get(kidTaken.id)}` : undefined}
                    actions={<Checkbox checked={on} />}
                    quiet={blocked}
                    onClick={blocked ? undefined : () => toggle(c.id)}
                  />
                  {!on && !taken && kids.map((k) => {
                    const kt = owner.get(k.id);
                    return (
                      <ListRow key={k.id} className="env-sub" leading={<Emo e={k.emoji} color={k.color} size={32} />} title={k.name}
                        detail={kt ? `En ${kt}` : undefined} actions={<Checkbox checked={f.cats.has(k.id)} />} quiet={!!kt} onClick={kt ? undefined : () => toggle(k.id)} />
                    );
                  })}
                </div>
              );
            })}
          </ListGroup>
        )}

        {existing && (
          <div className="page-actions">
            <Button variant="ghost" size="md" block className="danger" onClick={remove} leading={<Icon name="trash" size={16} />}>Borrar partida</Button>
          </div>
        )}
      </div>
      <ActionBar>
        <Button variant="primary" size="lg" block disabled={busy || !valid} onClick={save}>{isNew ? `Agregar ${KIND_LABEL[f.kind].toLowerCase()}` : 'Guardar'}</Button>
      </ActionBar>
    </div>
  );
}

function typed(n: number) {
  const [i, d] = n.toFixed(2).split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d !== '00' ? `,${d}` : '');
}
