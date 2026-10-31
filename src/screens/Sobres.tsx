import { useMemo, useState } from 'react';
import { ActionBar, BalanceSummary, Button, Checkbox, EmptyState, GroupSkeleton, ListGroup, ListRow, Loader, PageHeader, Progress, SummarySkeleton, TxListSkeleton } from '../ds';
import { db } from '../lib/api';
import { envelopeOf, envelopesSpan, envelopeStats, PERIOD_LABEL, PERIOD_NOW, toCrc, toSpend, useEnvelopes, type EnvPeriod, type EnvStat, type Envelope } from '../lib/envelopes';
import { amount, parseAmount, unitOf } from '../lib/format';
import { shortDay } from '../lib/recurring';
import { navigateBack, useApp, useTxs } from '../store';
import { Emo, Icon, Segmented } from '../ui';
import { FormPageSkeleton, PageSkeleton } from '../ui/Skeletons';
import { TxRow } from '../ui/TxRow';
import { groupByDay } from './Home';
import { useDesktop } from '../lib/useDesktop';
import { useMenu } from '../lib/menu';
import type { Currency } from '../lib/types';

/** Everything the envelope screens compute for the current periods. */
export function useEnvelopeStats() {
  const { space, categories, fx } = useApp();
  const ws = space?.week_start ?? 1;
  const span = useMemo(() => envelopesSpan(ws), [ws]);
  const { txs, loading } = useTxs(span);
  const d = useEnvelopes(space?.id);
  const stats = d && space ? envelopeStats({ ...d, categories, txs, spaceId: space.id, weekStart: ws, fx }) : null;
  return { stats, data: d, first: (loading && txs.length === 0) || !d };
}

/** The face of an envelope: its category's emoji when it has one, the envelope icon otherwise. */
function Face({ s, size = 40 }: { s: EnvStat; size?: number }) {
  const c = s.cats.length === 1 ? s.cats[0] : null;
  return c ? <Emo e={c.emoji} color={c.color} size={size} /> : <Emo icon="envelope" size={size} />;
}

const tone = (pct: number) => (pct >= 100 ? 'destructive' : pct >= 80 ? 'warning' : 'default') as 'destructive' | 'warning' | 'default';

/** One envelope as a row (SOB-08): what's left of how much, the period when it isn't the month, and its bar. */
function EnvelopeRow({ s }: { s: EnvStat }) {
  const { cur, fx } = useApp();
  const u = unitOf(cur);
  const href = `#/sobre/${s.env.id}`;
  // the period goes next to the name when it isn't the month, so the detail stays short
  const title = s.env.period !== 'monthly' ? <>{s.env.name} <span className="env-period">{PERIOD_LABEL[s.env.period]}</span></> : s.env.name;
  if (s.amount == null) {
    return <ListRow leading={<Face s={s} />} title={title} detail={`Gastado ${amount(s.spent, cur, fx)} ${u} ${PERIOD_NOW[s.env.period]}`} chevron href={href} label={s.env.name} />;
  }
  const used = s.spent + s.committed;
  const pct = s.amount > 0 ? Math.round((used / s.amount) * 100) : 0;
  const over = s.left! < 0;
  return (
    <ListRow
      leading={<Face s={s} />}
      title={title}
      detail={over ? `Te pasaste por ${amount(-s.left!, cur, fx)} ${u}` : `Quedan ${amount(s.left!, cur, fx)} de ${amount(s.amount, cur, fx)} ${u}`}
      detailTone={over ? 'destructive' : 'muted'}
      value={`${pct}%`}
      valueTone={tone(pct)}
      chevron
      href={href}
      label={`${s.env.name}: quedan ${amount(s.left!, cur, fx)} de ${amount(s.amount, cur, fx)} ${u}`}
      below={<EnvBar s={s} />}
    />
  );
}

/** Spent, and lighter, committed (SOB-08). */
function EnvBar({ s }: { s: EnvStat }) {
  if (!s.amount) return null;
  const spent = Math.min(s.spent / s.amount, 1);
  const committed = Math.min(s.committed / s.amount, 1 - spent);
  const pct = Math.round(((s.spent + s.committed) / s.amount) * 100);
  return (
    <div className="env-bar">
      <Progress size="sm" value={spent} tone={tone(pct)} label={`${s.env.name}: ${pct}% usado`} />
      {committed > 0 && <span className="env-bar__commit" style={{ left: `${spent * 100}%`, width: `${committed * 100}%` }} aria-hidden="true" />}
    </div>
  );
}

/** Presupuesto (menu, route #/categorias): the envelopes (docs/comportamiento/presupuesto.md, SOB-08). */
export function Presupuesto() {
  const { space, cur, fx } = useApp();
  const desk = useDesktop();
  const menu = useMenu();
  const { stats, first } = useEnvelopeStats();
  if (!space) return <PageSkeleton title="Presupuesto"><GroupSkeleton rows={5} below /></PageSkeleton>;
  const u = unitOf(cur);
  const sum = stats ? toSpend(stats) : null;
  const own = stats?.filter((s) => !s.env.is_rest) || [];
  const rest = stats?.find((s) => s.env.is_rest);
  const shared = space.kind === 'shared';

  const summary = sum ? (
    <BalanceSummary
      label={sum.left < 0 ? (shared ? 'Se pasaron por' : 'Te pasaste por') : 'Para gastar'}
      value={amount(Math.abs(sum.left), cur, fx)}
      unit={u}
      negative={sum.left < 0}
      meta={`de ${amount(sum.total, cur, fx)} ${u} en ${sum.count} ${sum.count === 1 ? 'sobre' : 'sobres'}`}
    />
  ) : (
    <BalanceSummary label="Para gastar" value="0" unit={u} meta="Creá un sobre para saber cuánto te queda" />
  );

  const body = (
    <>
      <ListGroup title="Sobres" action={<a href="#/sobre/nuevo">Nuevo</a>}>
        {own.length === 0 ? (
          <ListRow leading={<Icon name="plus" size={16} />} title="Nuevo sobre" detail="Por ejemplo, Comer afuera: 60.000 al mes" href="#/sobre/nuevo" chevron quiet />
        ) : own.map((s) => <EnvelopeRow key={s.env.id} s={s} />)}
      </ListGroup>
      {rest && (
        <ListGroup note="Lo que no cae en ningún sobre.">
          <EnvelopeRow s={rest} />
        </ListGroup>
      )}
    </>
  );

  if (desk) {
    return (
      <div className="dpage">
        <header className="dpage-head"><h1 className="dtitle">Presupuesto</h1></header>
        {first ? (
          <Loader><div className="dcol gap24 dnarrow"><SummarySkeleton /><GroupSkeleton rows={5} below /></div></Loader>
        ) : (
          <div className="dcol gap24 dnarrow">{summary}{body}</div>
        )}
      </div>
    );
  }
  return (
    <div className="page">
      <PageHeader title="Presupuesto" onMenu={menu?.open} actions={<Button variant="secondary" size="xs" iconOnly onClick={() => (location.hash = '#/sobre/nuevo')} aria-label="Nuevo sobre"><Icon name="plus" size={14} /></Button>} />
      <div className="page-hero">{first ? <Loader><SummarySkeleton /></Loader> : summary}</div>
      <div className="page-body">{first ? <Loader><GroupSkeleton rows={5} below /></Loader> : body}</div>
    </div>
  );
}

/** One envelope (#/sobre/<id>): what's left, the pace, its categories, its recurrents of the period and its movements. */
export function EnvelopeView({ id }: { id: string }) {
  const { space, cur, fx } = useApp();
  const { stats, first } = useEnvelopeStats();
  const s = stats?.find((x) => x.env.id === id || (id === 'rest' && x.env.is_rest));
  if (!space || first || !s) {
    if (stats && !s) return <EmptyState icon={<Icon name="envelope" size={24} />} title="Ese sobre ya no existe" />;
    return <PageSkeleton back nav={false}><TxListSkeleton /></PageSkeleton>;
  }
  const u = unitOf(cur);
  const r = s.range;
  const days = r.daysLeft;
  const pace = s.left != null && s.left > 0 && days > 1 ? ` · ${amount(s.left / days, cur, fx)} ${u} por día` : '';
  const periodLabel = `Del ${shortDay(r.fromDay)} al ${shortDay(prevDay(r.toDay))}`;
  const groups = groupByDay(s.txs);
  const editHref = `#/sobre/${s.env.is_rest ? 'rest' : s.env.id}/editar`;

  return (
    <div className="page no-nav">
      <PageHeader
        title={s.env.name}
        onBack={navigateBack}
        actions={<Button variant="secondary" size="xs" iconOnly onClick={() => (location.hash = editHref)} aria-label="Editar sobre"><Icon name="pencil" size={14} /></Button>}
      />
      <div className="page-hero">
        {s.amount != null ? (
          <BalanceSummary
            label={s.left! < 0 ? 'Te pasaste por' : 'Quedan para gastar'}
            value={amount(Math.abs(s.left!), cur, fx)}
            unit={u}
            negative={s.left! < 0}
            meta={`de ${amount(s.amount, cur, fx)} ${u} · ${days === 1 ? 'último día' : `${days} días`}${pace}`}
          />
        ) : (
          <BalanceSummary label={`Gastado ${PERIOD_NOW[s.env.period]}`} value={amount(s.spent, cur, fx)} unit={u} meta="Sin monto: no suma a Para gastar" />
        )}
      </div>
      <div className="page-body">
        <ListGroup title={PERIOD_LABEL[s.env.period]} note={periodLabel}>
          <ListRow title="Gastado" value={<>{amount(s.spent, cur, fx)}<span className="amt-unit"> {u}</span></>} below={<EnvBar s={s} />} />
          {s.committed > 0 && <ListRow title="Comprometido" detail="Recurrentes que todavía no se cobran" value={<>{amount(s.committed, cur, fx)}<span className="amt-unit"> {u}</span></>} />}
        </ListGroup>

        {(s.pending.length > 0 || s.paid.length > 0) && (
          <ListGroup title="Recurrentes">
            {s.paid.map(({ r: rr, tx }) => (
              <ListRow key={tx.id} leading={<Icon name="checkCircle" size={16} />} title={rr.merchant} detail={`Pagado el ${shortDay(tx.occurred_at.slice(0, 10))}`} detailTone="success"
                value={<>{amount(Number(tx.amount_crc), cur, fx)}<span className="amt-unit"> {u}</span></>} href={`#/recurrente/${rr.id}`} chevron />
            ))}
            {s.pending.map((c) => (
              <ListRow key={c.r.id} leading={<Icon name="clock" size={16} />} title={c.r.merchant}
                detail={c.dates.length > 1 ? `${c.dates.length} pagos · el próximo el ${shortDay(c.dates[0])}` : `${c.dates[0] < todayKey() ? 'Venció' : 'Vence'} el ${shortDay(c.dates[0])}`}
                detailTone={c.dates[0] < todayKey() ? 'warning' : 'muted'}
                value={<>{c.r.variable ? '≈ ' : ''}{amount(c.amount, cur, fx)}<span className="amt-unit"> {u}</span></>} href={`#/recurrente/${c.r.id}`} chevron />
            ))}
          </ListGroup>
        )}

        {!s.env.is_rest && (
          <ListGroup title="Categorías" action={<a href={editHref}>Cambiar</a>}>
            {s.cats.length === 0 ? <div className="group-pad page-text">Este sobre no tiene categorías.</div> : s.cats.map((c) => (
              <ListRow key={c.id} leading={<Emo e={c.emoji} color={c.color} size={40} />} title={c.name} href={`#/categoria/${c.id}`} chevron />
            ))}
          </ListGroup>
        )}

        {groups.length === 0 ? (
          <EmptyState icon={<Icon name="envelope" size={24} />} title={`Sin gastos ${PERIOD_NOW[s.env.period]}`} />
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

const todayKey = () => new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10);
const prevDay = (d: string) => new Date(Date.parse(d) - 86400000).toISOString().slice(0, 10);

/** New or edit (#/sobre/nuevo, #/sobre/<id>/editar): name, amount, period and categories (SOB-01, SOB-06). */
export function EnvelopeEdit({ id }: { id: string }) {
  const { space, categories, cur, fx, toast, bump } = useApp();
  const { stats, data } = useEnvelopeStats();
  const isNew = id === 'nuevo';
  const existing = data?.envelopes.find((e) => e.id === id || (id === 'rest' && e.is_rest)) || null;
  const isRest = id === 'rest' || !!existing?.is_rest;
  const ready = !!data && (isNew || isRest || !!existing);
  const [form, setForm] = useState<{ name: string; amt: string; currency: Currency; period: EnvPeriod; cats: Set<string> } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!space || !ready) return <FormPageSkeleton title={isNew ? 'Nuevo sobre' : 'Editar sobre'} />;
  const f = form || {
    name: existing?.name || (isRest ? 'Todo lo demás' : ''),
    amt: existing?.amount ? typed(Number(existing.amount)) : '',
    currency: existing?.currency || cur,
    period: existing?.period || 'monthly',
    cats: new Set(data!.links.filter((l) => existing && l.envelope_id === existing.id).map((l) => l.category_id)),
  };
  const set = (patch: Partial<typeof f>) => setForm({ ...f, ...patch });
  const num = parseAmount(f.amt);
  const envs = data!.envelopes;
  const owner = new Map(data!.links.filter((l) => !existing || l.envelope_id !== existing.id).map((l) => [l.category_id, envs.find((e) => e.id === l.envelope_id)?.name || 'otro sobre']));
  const roots = categories.filter((c) => c.kind === 'expense' && !c.archived && !c.parent_id).sort((a, b) => a.sort - b.sort);
  const kidsOf = (pid: string) => categories.filter((c) => c.parent_id === pid && !c.archived).sort((a, b) => a.sort - b.sort);

  // SOB-06: what this envelope's recurrents add up to in its period
  const trial: Envelope = { id: existing?.id || 'trial', space_id: space.id, name: f.name, amount: 1, currency: f.currency, period: f.period, is_rest: isRest, sort: 0 };
  const trialLinks = [...data!.links.filter((l) => l.envelope_id !== trial.id), ...[...f.cats].map((c) => ({ category_id: c, envelope_id: trial.id }))];
  const sug = stats ? envelopeStats({ envelopes: [...envs.filter((e) => e.id !== trial.id && !(isRest && e.is_rest)), trial], links: trialLinks, categories, recurring: data!.recurring, txs: stats.flatMap((s) => s.txs), spaceId: space.id, weekStart: space.week_start ?? 1, fx }).find((s) => s.env.id === trial.id) : null;
  const sugCrc = sug ? sug.pending.reduce((a, c) => a + c.amount, 0) + sug.paid.reduce((a, p) => a + Number(p.tx.amount_crc), 0) : 0;
  const sugIn = (crc: number) => (f.currency === 'USD' ? crc / fx : crc);

  const toggle = (cid: string) => {
    const next = new Set(f.cats);
    if (next.has(cid)) next.delete(cid);
    else {
      next.add(cid);
      kidsOf(cid).forEach((k) => next.delete(k.id)); // the parent brings its subcategories
    }
    set({ cats: next });
  };

  async function save() {
    if (!space) return;
    setBusy(true);
    try {
      const row = { name: isRest ? 'Todo lo demás' : f.name.trim(), amount: num > 0 ? Math.round(num * 100) / 100 : null, currency: f.currency, period: f.period };
      let envId = existing?.id;
      if (envId) await db.update('envelopes', { id: envId }, row);
      else envId = (await db.insert<Envelope>('envelopes', { ...row, space_id: space.id, is_rest: isRest, sort: isRest ? 1000 : envs.length + 1 }))[0].id;
      if (!isRest) {
        const before = new Set(data!.links.filter((l) => l.envelope_id === envId).map((l) => l.category_id));
        for (const c of before) if (!f.cats.has(c)) await db.remove('envelope_categories', { category_id: c });
        const add = [...f.cats].filter((c) => !before.has(c));
        if (add.length) await db.insert('envelope_categories', add.map((c) => ({ category_id: c, envelope_id: envId })));
      }
      toast(isNew ? 'Sobre creado' : 'Sobre guardado');
      bump();
      history.back();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing || isRest) return;
    const links = data!.links.filter((l) => l.envelope_id === existing.id);
    try {
      await db.remove('envelopes', { id: existing.id });
      toast(`${existing.name} borrado`, async () => {
        const back = await db.insert<Envelope>('envelopes', { space_id: existing.space_id, name: existing.name, amount: existing.amount, currency: existing.currency, period: existing.period, sort: existing.sort });
        if (links.length) await db.insert('envelope_categories', links.map((l) => ({ category_id: l.category_id, envelope_id: back[0].id })));
      });
      bump();
      location.hash = '#/categorias';
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo borrar');
    }
  }

  const valid = (isRest || (f.name.trim() && num > 0)) && (!f.amt || num > 0);
  return (
    <div className="page no-nav">
      <PageHeader title={isNew ? 'Nuevo sobre' : isRest ? 'Todo lo demás' : 'Editar sobre'} onBack={navigateBack} />
      <div className="page-body">
        {isRest && <p className="page-text">Recibe los gastos que no caen en ningún otro sobre. Sin monto, solo muestra lo gastado.</p>}
        <div className="field-card">
          {!isRest && (
            <label className="field-row">
              <span>Nombre</span>
              <input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Comer afuera, súper…" aria-label="Nombre del sobre" />
            </label>
          )}
          <label className="field-row">
            <span>Monto{isRest ? ' (opcional)' : ''}</span>
            <input inputMode="decimal" value={f.amt} onChange={(e) => set({ amt: e.target.value.replace(/[^0-9.,]/g, '') })} placeholder="0" aria-label="Monto del sobre" />
          </label>
          <label className="field-row">
            <span>Moneda</span>
            <select value={f.currency} onChange={(e) => set({ currency: e.target.value as Currency })} aria-label="Moneda">
              <option value="CRC">Colones</option>
              <option value="USD">Dólares</option>
            </select>
          </label>
        </div>
        {sugCrc > 0 && (
          <div className="row between gap10 env-sug">
            <span className="page-text">Tus recurrentes de {PERIOD_NOW[f.period]} suman {amount(sugCrc, f.currency, fx)} {unitOf(f.currency)}</span>
            <Button variant="secondary" size="xs" onClick={() => set({ amt: typed(Math.round(sugIn(sugCrc) * 100) / 100) })}>Usar</Button>
          </div>
        )}
        <Segmented value={f.period} options={[['weekly', 'Semanal'], ['biweekly', 'Quincenal'], ['monthly', 'Mensual']]} onChange={(v) => set({ period: v })} />
        {f.period === 'biweekly' && <p className="page-text">Del 1 al 15 y del 16 al último día del mes.</p>}

        {!isRest && (
          <ListGroup title="Categorías" note="Una categoría solo puede estar en un sobre. La principal incluye sus subcategorías.">
            {roots.map((c) => {
              const taken = owner.get(c.id);
              const kids = kidsOf(c.id);
              const kidTaken = kids.find((k) => owner.has(k.id));
              const on = f.cats.has(c.id);
              return (
                <div key={c.id}>
                  <ListRow
                    leading={<Emo e={c.emoji} color={c.color} size={40} />}
                    title={c.name}
                    detail={taken ? `En ${taken}` : kidTaken && !on ? `${kidTaken.name} está en ${owner.get(kidTaken.id)}` : kids.length && on ? 'Con sus subcategorías' : undefined}
                    actions={<Checkbox checked={on} />}
                    quiet={!!taken}
                    onClick={taken || (kidTaken && !on) ? undefined : () => toggle(c.id)}
                  />
                  {!on && !taken && kids.map((k) => {
                    const kt = owner.get(k.id);
                    return (
                      <ListRow
                        key={k.id}
                        className="env-sub"
                        leading={<Emo e={k.emoji} color={k.color} size={32} />}
                        title={k.name}
                        detail={kt ? `En ${kt}` : undefined}
                        actions={<Checkbox checked={f.cats.has(k.id)} />}
                        quiet={!!kt}
                        onClick={kt ? undefined : () => toggle(k.id)}
                      />
                    );
                  })}
                </div>
              );
            })}
          </ListGroup>
        )}

        {existing && !isRest && (
          <div className="page-actions">
            <Button variant="ghost" size="md" block className="danger" onClick={remove} leading={<Icon name="trash" size={16} />}>Borrar sobre</Button>
          </div>
        )}
      </div>
      <ActionBar>
        <Button variant="primary" size="lg" block disabled={busy || !valid} onClick={save}>{isNew ? 'Crear sobre' : 'Guardar'}</Button>
      </ActionBar>
    </div>
  );
}

function typed(n: number) {
  const [i, d] = n.toFixed(2).split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d !== '00' ? `,${d}` : '');
}

// re-exported so Home can use the same numbers
export { toSpend, envelopeOf, toCrc };
