import { useEffect, useMemo, useRef, useState } from 'react';
import { BalanceSummary, Button, Chip, EmptyState, ListGroup, ListRow, Loader, PageHeader, Progress, Switch, TxListSkeleton } from '../ds';
import { FormPageSkeleton, PageSkeleton } from '../ui/Skeletons';
import { db } from '../lib/api';
import { inRange, monthRange, sumSpend, weekRange } from '../lib/calc';
import { amount, crIso, money, monthName, monthShort, parseAmount, shortK, todayCR, unitOf } from '../lib/format';
import type { Category } from '../lib/types';
import { go, navigateBack, useApp, useTxs } from '../store';
import { COLOR_NAMES, Emo, Icon, Loading, Segmented, tint } from '../ui';
import { groupByDay } from './Home';
import { periodRange, usePeriod } from '../lib/period';
import { PeriodPicker } from '../ui/PeriodPicker';
import { TxRow } from '../ui/TxRow';
import { catLabel, childrenOf, familyIds, parentOf, pickerOrder } from '../lib/cats';

const hashParam = (k: string) => new URLSearchParams(location.hash.split('?')[1] || '').get(k);

const EMOJI_IDEAS = ['🛒', '🍽️', '🛵', '🚕', '⛽', '🪴', '🔑', '💡', '🎬', '💊', '📺', '👕', '☕', '🐾', '🎁', '✈️', '📚', '🏋️', '💇', '🧾', '💼', '💻', '💰', '✨'];

export function CategoryEdit({ id }: { id: string }) {
  const { categories, space, cur, fx, toast, reloadMeta, bump } = useApp();
  const isNew = id === 'nueva';
  const existing = categories.find((c) => c.id === id);
  const [parentId, setParentId] = useState<string>(existing?.parent_id || (isNew ? hashParam('parent') || '' : ''));
  const parent = categories.find((c) => c.id === parentId) || null;
  const kids = existing ? childrenOf(categories, existing.id) : [];
  const [name, setName] = useState(existing?.name || '');
  const [emoji, setEmoji] = useState(existing?.emoji || '✨');
  const [color, setColor] = useState(existing?.color || 'mint');
  const [kind, setKind] = useState<Category['kind']>(existing?.kind || categories.find((c) => c.id === parentId)?.kind || 'expense');
  const [period, setPeriod] = useState<'monthly' | 'weekly' | 'none'>(existing?.limit_period || (existing?.limit_amount ? 'monthly' : isNew ? 'monthly' : 'none'));
  const [limit, setLimit] = useState(existing?.limit_amount ? String(existing.limit_amount) : '');
  const [fixed, setFixed] = useState(existing?.is_fixed || false);
  const [moveTo, setMoveTo] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  // opened directly (a reload): the category arrives after the first render, so fill the form then
  const filled = useRef(!!existing);
  useEffect(() => {
    if (filled.current || !existing) return;
    filled.current = true;
    setParentId(existing.parent_id || '');
    setName(existing.name);
    setEmoji(existing.emoji || '✨');
    setColor(existing.color || 'mint');
    setKind(existing.kind);
    setPeriod(existing.limit_period || (existing.limit_amount ? 'monthly' : 'none'));
    setLimit(existing.limit_amount ? String(existing.limit_amount) : '');
    setFixed(existing.is_fixed || false);
  }, [existing]);
  const t = todayCR();
  const range = useMemo(() => ({ from: crIso(t.y, t.m - 5, 1), to: crIso(t.y, t.m + 1, 1) }), [t.y, t.m]);
  const { txs } = useTxs(isNew ? null : range);

  if (!space || (!isNew && !existing)) return <FormPageSkeleton title={isNew ? 'Nueva categoría' : 'Editar categoría'} />;

  const fam = familyIds(categories, id);
  const mine = txs.filter((x) => x.category_id && fam.has(x.category_id));
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(t.y, t.m - 5 + i, 1));
    const r = monthRange(d.getUTCFullYear(), d.getUTCMonth());
    return { m: d.getUTCMonth(), v: sumSpend(mine.filter((x) => inRange(x, r))) };
  });
  const max = Math.max(...months.map((m) => m.v), existing?.limit_amount ? Number(existing.limit_amount) : 0, 1);
  const thisMonth = mine.filter((x) => inRange(x, monthRange(t.y, t.m)));

  async function save() {
    if (!name.trim() || !space) return;
    setBusy(true);
    const row = {
      space_id: space.id,
      name: name.trim(),
      emoji: emoji.trim() || '✨',
      color,
      kind: parent ? parent.kind : kind,
      parent_id: parent ? parent.id : null,
      // budgets live on the parent
      limit_amount: parent || period === 'none' || !limit ? null : parseAmount(limit),
      limit_period: parent || period === 'none' ? null : period,
      is_fixed: parent ? false : fixed,
    };
    try {
      if (isNew) await db.insert('categories', { ...row, sort: categories.length + 1 });
      else await db.update('categories', { id }, row);
      await reloadMeta();
      bump();
      toast('✅ Categoría guardada');
      history.back();
    } catch (e) {
      toast(e instanceof Error && /duplicate|unique/i.test(e.message) ? 'Ya existe una categoría con ese nombre' : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    await db.update('categories', { id }, { archived: !existing?.archived });
    await reloadMeta();
    toast(existing?.archived ? 'Categoría restaurada' : 'Categoría archivada · su historial se conserva');
    history.back();
  }

  async function remove() {
    if (moveTo) await db.update('transactions', { category_id: id }, { category_id: moveTo });
    await db.remove('categories', { id });
    await reloadMeta();
    bump();
    toast('Categoría eliminada');
    go('/presupuesto');
  }

  return (
    <div className="page no-nav">
      <PageHeader title={isNew ? (parent ? 'Nueva subcategoría' : 'Nueva categoría') : parent ? 'Editar subcategoría' : 'Editar categoría'} onBack={navigateBack} />
      <div className="page-body">

      <div className="card pad col gap14 center-items">
        <Emo e={emoji || '✨'} color={color} size={56} />
        <label className="col gap6 full">
          <span className="field-label">Nombre</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Mascotas" />
        </label>
        <label className="col gap6 full">
          <span className="field-label">Emoji</span>
          <input className="input" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} />
        </label>
        <div className="emoji-ideas">
          {EMOJI_IDEAS.map((e) => (
            <button key={e} className={e === emoji ? 'emoji-btn on' : 'emoji-btn'} onClick={() => setEmoji(e)} aria-label={`Usar ${e}`}>{e}</button>
          ))}
        </div>
        <div className="swatches" role="radiogroup" aria-label="Color">
          {COLOR_NAMES.map((c) => (
            <button key={c} role="radio" aria-checked={c === color} aria-label={c} className={c === color ? 'swatch on' : 'swatch'} style={{ background: tint(c) }} onClick={() => setColor(c)} />
          ))}
        </div>
      </div>

      <div className="card pad col gap10">
        <label className="col gap6">
          <span className="field-label">Dentro de</span>
          <select className="input" value={parentId} onChange={(e) => setParentId(e.target.value)} disabled={kids.length > 0}>
            <option value="">Ninguna · es una categoría principal</option>
            {categories
              .filter((c) => !c.parent_id && c.id !== id && !c.archived && (isNew || c.kind === (existing?.kind || kind)))
              .sort((a, b) => a.sort - b.sort)
              .map((c) => (
                <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
              ))}
          </select>
        </label>
        <span className="hint">
          {kids.length > 0
            ? 'Tiene subcategorías, así que se queda como principal.'
            : parent
              ? `Sus gastos suman al presupuesto de ${parent.name}. El límite se define allá.`
              : 'Elegí una principal si querés que sea una subcategoría (ej. Bares dentro de Salidas).'}
        </span>
      </div>

      {!parent && (
      <div className="card pad col gap14">
        <Segmented value={kind} options={[['expense', '💸 Gasto'], ['income', '💰 Ingreso']]} onChange={setKind} />
        {kind === 'expense' && (
          <>
            <span className="field-label">Límite</span>
            <Segmented value={period} options={[['monthly', 'Mensual'], ['weekly', 'Semanal'], ['none', 'Sin límite']]} onChange={setPeriod} dark={false} />
            {period !== 'none' && (
              <label className="amount-input small">
                <span className="amount-sym">¢</span>
                <input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="0" aria-label="Monto del límite en colones" />
              </label>
            )}
            {period === 'weekly' && <span className="hint">La semana empieza el viernes, igual que el pago de la tarjeta.</span>}
            <div className="field-row bare">
              <span className="col">
                <span>Gasto fijo</span>
                <small>Alquiler, servicios… no genera alertas al llegar al 100%</small>
              </span>
              <Switch checked={fixed} label="Gasto fijo" onChange={() => setFixed((f) => !f)} />
            </div>
          </>
        )}
      </div>
      )}

      {!isNew && !parent && existing && (
        <ListGroup title="Subcategorías" action={<a href={`#/categoria/nueva?parent=${existing.id}`}>Nueva</a>} note={kids.length === 0 ? 'Sirven para detallar sin partir el presupuesto, por ejemplo Bares y Café dentro de Salidas.' : undefined}>
          {kids.length === 0 ? (
            <ListRow leading={<ListRow.Icon name="plus" />} title="Agregar subcategoría" chevron href={`#/categoria/nueva?parent=${existing.id}`} />
          ) : kids.map((k) => (
            <ListRow key={k.id} leading={<Emo e={k.emoji} color={k.color} size={40} />} title={k.name} chevron href={`#/categoria/${k.id}/editar`} />
          ))}
        </ListGroup>
      )}

      {!isNew && (
        <>
          <ListGroup title="Últimos 6 meses">
            <div className="group-pad">
              <div className="month-bars short" role="img" aria-label={months.map((m) => `${monthShort(m.m)} ${money(m.v, cur, fx)}`).join(', ')}>
                {months.map((m, i) => (
                  <div key={i} className="mb-col">
                    <div className="mb-area">
                      <div className={i === 5 ? 'mb-fill is-on' : 'mb-fill'} style={{ height: `${(m.v / max) * 100}%` }} />
                      {m.v > 0 && <span className={i === 5 ? 'mb-val is-on' : 'mb-val'} style={{ bottom: `calc(${(m.v / max) * 100}% + 4px)` }}>{Math.round((cur === 'USD' ? m.v / fx : m.v) / 1000) + 'k'}</span>}
                    </div>
                    <span className={i === 5 ? 'mb-label is-on' : 'mb-label'}>{monthShort(m.m)}</span>
                  </div>
                ))}
              </div>
            </div>
          </ListGroup>

          {thisMonth.length > 0 && (
            <ListGroup title="Este mes">
              <div className="txd-list">{thisMonth.map((x) => <TxRow key={x.id} t={x} size="sheet" />)}</div>
            </ListGroup>
          )}

          {confirmDelete && (
            <ListGroup title="Eliminar categoría">
              <div className="group-pad col gap10">
                <label className="col gap6">
                  <span className="field-label">¿A dónde muevo sus movimientos?</span>
                  <select className="input" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                    <option value="">Dejarlos sin categoría (por revisar)</option>
                    {pickerOrder(categories.filter((c) => c.id !== id && c.kind === existing?.kind && !c.archived)).map((c) => (
                      <option key={c.id} value={c.id}>{c.emoji} {catLabel(categories, c)}</option>
                    ))}
                  </select>
                </label>
                <Button variant="destructive" size="sm" onClick={remove}>Eliminar definitivamente</Button>
              </div>
            </ListGroup>
          )}
        </>
      )}
      </div>
      <div className="page-actions">
        <Button variant="primary" size="lg" block onClick={save} disabled={busy || !name.trim()}>{busy ? 'Guardando…' : 'Guardar'}</Button>
        {!isNew && <Button variant="ghost" size="md" block onClick={archive}>{existing?.archived ? 'Restaurar categoría' : 'Archivar (oculta, conserva el historial)'}</Button>}
        {!isNew && !confirmDelete && <Button variant="ghost" size="md" block className="danger" onClick={() => setConfirmDelete(true)} leading={<Icon name="trash" size={16} />}>Eliminar categoría</Button>}
      </div>
    </div>
  );
}

/** Movements of one category, month by month. The pencil opens the editor. */
export function CategoryView({ id }: { id: string }) {
  const { categories, space, cur, fx } = useApp();
  const cat = categories.find((c) => c.id === id);
  const [pk, setPk] = usePeriod('cat');
  const period = periodRange(pk, space?.week_start ?? 5);
  const isCurrent = pk === 'month';
  const month = period;
  const week = weekRange(space?.week_start ?? 5);
  const range = useMemo(() => ({ from: [month.from, week.from].sort()[0], to: [month.to, week.to].sort()[1] }), [month.from, month.to, week.from, week.to]);
  const { txs, loading } = useTxs(range);
  const [sub, setSub] = useState<string>(() => hashParam('sub') || 'all');
  useEffect(() => {
    const on = () => setSub(hashParam('sub') || 'all');
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    document.querySelector('.sub-chips .pill.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [sub, txs.length]);

  if (!space || !cat) return <PageSkeleton back nav={false}><TxListSkeleton /></PageSkeleton>;
  const parent = parentOf(categories, cat);
  const kids = childrenOf(categories, cat.id);
  const fam = familyIds(categories, id);
  const mine = txs.filter((x) => x.category_id && fam.has(x.category_id));
  const shown = sub === 'all' ? mine : mine.filter((x) => x.category_id === (sub === 'none' ? id : sub));
  const inMonth = shown.filter((x) => inRange(x, month));
  const famTotal = sumSpend(mine.filter((x) => inRange(x, month)));
  const subTotals = new Map<string, number>();
  mine.filter((x) => inRange(x, month)).forEach((x) => subTotals.set(x.category_id!, (subTotals.get(x.category_id!) || 0) + (cat.kind === 'income' ? Number(x.amount_crc) : sumSpend([x]))));
  const total = cat.kind === 'income' ? inMonth.reduce((a, x) => a + Number(x.amount_crc), 0) : sumSpend(inMonth);
  const weekly = cat.limit_period === 'weekly';
  const limit = cat.limit_amount ? Number(cat.limit_amount) : null;
  const monthLike = pk === 'month' || pk === 'lastmonth' || pk.startsWith('m:');
  const weekLike = pk === 'week' || pk === 'lastweek';
  // the limit bar only makes sense when the period matches the limit's period
  const showLimit = limit !== null && (weekly ? weekLike || isCurrent : monthLike);
  const periodSpent = weekly && isCurrent ? sumSpend(mine.filter((x) => inRange(x, week))) : famTotal;
  const pct = limit ? Math.round((periodSpent / limit) * 100) : null;
  const groups = groupByDay(inMonth);

  const subLabel = sub !== 'all' ? ` · ${sub === 'none' ? 'sin detalle' : kids.find((k) => k.id === sub)?.name || ''}` : '';
  return (
    <div className="page no-nav">
      <PageHeader
        title={<>{cat.emoji} {cat.name}</>}
        onBack={navigateBack}
        actions={<Button variant="secondary" size="xs" iconOnly onClick={() => go(`/categoria/${id}/editar`)} aria-label="Editar categoría"><Icon name="pencil" size={14} /></Button>}
      />
      <div className="page-hero">
        <BalanceSummary
          label={`${cat.kind === 'income' ? 'Ingresos' : 'Gastado'}${subLabel}${parent ? ` · en ${parent.name}` : ''}`}
          value={amount(total, cur, fx)}
          unit={unitOf(cur)}
          meta={inMonth.length === 1 ? '1 movimiento' : `${inMonth.length} movimientos`}
          action={<PeriodPicker value={pk} onChange={setPk} weekStart={space?.week_start ?? 5} />}
        />
      </div>

      {kids.length > 0 && (
        <div className="page-chips sub-chips" role="tablist" aria-label="Filtrar por subcategoría">
          {[{ id: 'all', label: 'Todas', emoji: '' }, ...kids.map((k) => ({ id: k.id, label: k.name, emoji: k.emoji })), { id: 'none', label: 'Sin detalle', emoji: '' }]
            .filter((o) => o.id !== 'none' || sub === 'none' || (subTotals.get(id) ?? 0) !== 0)
            .map((o) => {
              const v = o.id === 'all' ? null : subTotals.get(o.id === 'none' ? id : o.id) || 0;
              return (
                <Chip key={o.id} size="sm" role="tab" aria-selected={sub === o.id} selected={sub === o.id} onClick={() => setSub(o.id)} leading={o.emoji ? <span aria-hidden="true">{o.emoji}</span> : undefined}>
                  {o.label}{v ? <span className="ds-chip__count"> {shortK(v, cur, fx)}</span> : null}
                </Chip>
              );
            })}
        </div>
      )}

      <div className="page-body">
        {showLimit && limit !== null && (
          <ListGroup title={weekly && isCurrent ? 'Límite de esta semana' : weekly ? 'Límite semanal' : 'Límite mensual'}>
            <ListRow
              title={`${amount(periodSpent, cur, fx)} de ${amount(limit, cur, fx)} ${unitOf(cur)}`}
              value={`${pct || 0}%`}
              valueTone={(pct || 0) >= 100 ? 'destructive' : (pct || 0) >= 80 ? 'warning' : 'default'}
              below={<Progress size="sm" value={(pct || 0) / 100} tone={(pct || 0) >= 100 ? 'destructive' : (pct || 0) >= 80 ? 'warning' : 'default'} />}
            />
          </ListGroup>
        )}

        {loading && txs.length === 0 ? (
          <Loader><TxListSkeleton /></Loader>
        ) : groups.length === 0 ? (
          <EmptyState icon={cat.emoji} title={`Sin movimientos · ${period.label}`}>Probá con otro período.</EmptyState>
        ) : (
          <div className="mb-flat">
            {groups.map((g) => (
              <section key={g.label} className="mb-day">
                <div className="mb-day-head row between"><span>{g.label}</span>{g.total !== 0 && <span>{amount(g.total, cur, fx)} {unitOf(cur)}</span>}</div>
                {g.rows.map((x) => <TxRow key={x.id} t={x} size="sheet" />)}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
