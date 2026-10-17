import { useMemo, useState } from 'react';
import { db } from '../lib/api';
import { inRange, monthRange, sumSpend, weekRange } from '../lib/calc';
import { crIso, money, monthName, monthShort, parseAmount, todayCR } from '../lib/format';
import type { Category } from '../lib/types';
import { go, useApp, useTxs } from '../store';
import { BigMoney, COLOR_NAMES, Emo, Icon, Loading, Segmented, tint } from '../ui';
import { groupByDay, MonthNav, useMonth } from './Home';
import { TxRow } from '../ui/TxRow';

const EMOJI_IDEAS = ['🛒', '🍽️', '🛵', '🚕', '⛽', '🪴', '🔑', '💡', '🎬', '💊', '📺', '👕', '☕', '🐾', '🎁', '✈️', '📚', '🏋️', '💇', '🧾', '💼', '💻', '💰', '✨'];

export function CategoryEdit({ id }: { id: string }) {
  const { categories, space, cur, fx, toast, reloadMeta, bump } = useApp();
  const isNew = id === 'nueva';
  const existing = categories.find((c) => c.id === id);
  const [name, setName] = useState(existing?.name || '');
  const [emoji, setEmoji] = useState(existing?.emoji || '✨');
  const [color, setColor] = useState(existing?.color || 'mint');
  const [kind, setKind] = useState<Category['kind']>(existing?.kind || 'expense');
  const [period, setPeriod] = useState<'monthly' | 'weekly' | 'none'>(existing?.limit_period || (existing?.limit_amount ? 'monthly' : isNew ? 'monthly' : 'none'));
  const [limit, setLimit] = useState(existing?.limit_amount ? String(existing.limit_amount) : '');
  const [fixed, setFixed] = useState(existing?.is_fixed || false);
  const [moveTo, setMoveTo] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const t = todayCR();
  const range = useMemo(() => ({ from: crIso(t.y, t.m - 5, 1), to: crIso(t.y, t.m + 1, 1) }), [t.y, t.m]);
  const { txs } = useTxs(isNew ? null : range);

  if (!space) return <Loading />;
  if (!isNew && !existing) return <Loading />;

  const mine = txs.filter((x) => x.category_id === id);
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
      kind,
      limit_amount: period === 'none' || !limit ? null : parseAmount(limit),
      limit_period: period === 'none' ? null : period,
      is_fixed: fixed,
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
    <div className="screen no-nav">
      <header className="topbar">
        <button className="round" onClick={() => history.back()} aria-label="Volver"><Icon name="back" /></button>
        <h1 className="h2">{isNew ? 'Nueva categoría' : 'Editar categoría'}</h1>
        <span style={{ width: 48 }} />
      </header>

      <div className="card pad col gap14 center-items">
        <Emo e={emoji || '✨'} color={color} size={72} />
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

      <div className="card pad col gap14">
        <Segmented value={kind} options={[['expense', '💸 Gasto'], ['income', '💰 Ingreso']]} onChange={setKind} />
        {kind === 'expense' && (
          <>
            <span className="field-label">Límite</span>
            <Segmented value={period} options={[['monthly', 'Mensual'], ['weekly', 'Semanal'], ['none', 'Sin límite']]} onChange={setPeriod} dark={false} />
            {period !== 'none' && (
              <label className="amount-input small">
                <span className="amount-sym">₡</span>
                <input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="0" aria-label="Monto del límite en colones" />
              </label>
            )}
            {period === 'weekly' && <span className="hint">La semana empieza el viernes, igual que el pago de la tarjeta.</span>}
            <div className="field-row bare">
              <span className="col">
                <span>Gasto fijo</span>
                <small>Alquiler, servicios… no genera alertas al llegar al 100%</small>
              </span>
              <button role="switch" aria-checked={fixed} aria-label="Gasto fijo" className={fixed ? 'switch on' : 'switch'} onClick={() => setFixed((f) => !f)}><span /></button>
            </div>
          </>
        )}
      </div>

      <button className="btn-dark big" onClick={save} disabled={busy || !name.trim()}>{busy ? 'Guardando…' : 'Guardar'}</button>

      {!isNew && (
        <>
          <section className="card pad col gap14">
            <h2 className="h3">Últimos 6 meses</h2>
            <div className="month-bars short" role="img" aria-label={months.map((m) => `${monthShort(m.m)} ${money(m.v, cur, fx)}`).join(', ')}>
              {months.map((m, i) => (
                <div key={i} className="mb-col">
                  <div className="mb-area">
                    <div className="mb-fill" style={{ height: `${(m.v / max) * 100}%`, background: i === 5 ? tint(color) : '#E2E2DE' }} />
                    <span className="mb-val">{m.v ? Math.round((cur === 'USD' ? m.v / fx : m.v) / 1000) + 'k' : ''}</span>
                  </div>
                  <span className="mb-label">{monthShort(m.m)}</span>
                </div>
              ))}
            </div>
          </section>

          {thisMonth.length > 0 && (
            <section className="col gap8">
              <h2 className="h3 px4">Este mes</h2>
              <div className="card list">{thisMonth.map((x) => <TxRow key={x.id} t={x} />)}</div>
            </section>
          )}

          <div className="card pad col gap10">
            <button className="btn-light" onClick={archive}>{existing?.archived ? '♻️ Restaurar categoría' : '🗄️ Archivar (oculta, conserva historial)'}</button>
            {!confirmDelete ? (
              <button className="btn-danger" onClick={() => setConfirmDelete(true)}><Icon name="trash" size={18} /> Eliminar categoría</button>
            ) : (
              <div className="col gap10">
                <label className="col gap6">
                  <span className="field-label">¿A dónde muevo sus movimientos?</span>
                  <select className="input" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                    <option value="">Dejarlos sin categoría (por revisar)</option>
                    {categories.filter((c) => c.id !== id && c.kind === existing?.kind).map((c) => (
                      <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
                    ))}
                  </select>
                </label>
                <button className="btn-danger solid" onClick={remove}>Eliminar definitivamente</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Movements of one category, month by month. The pencil opens the editor. */
export function CategoryView({ id }: { id: string }) {
  const { categories, space, cur, fx } = useApp();
  const cat = categories.find((c) => c.id === id);
  const [ym, setYm] = useMonth();
  const t = todayCR();
  const isCurrent = ym[0] === t.y && ym[1] === t.m;
  const month = monthRange(ym[0], ym[1]);
  const week = weekRange(space?.week_start ?? 5);
  const range = useMemo(() => ({ from: [month.from, week.from].sort()[0], to: [month.to, week.to].sort()[1] }), [month.from, month.to, week.from, week.to]);
  const { txs, loading } = useTxs(range);

  if (!space || !cat) return <Loading />;
  const mine = txs.filter((x) => x.category_id === id);
  const inMonth = mine.filter((x) => inRange(x, month));
  const total = cat.kind === 'income' ? inMonth.reduce((a, x) => a + Number(x.amount_crc), 0) : sumSpend(inMonth);
  const weekly = cat.limit_period === 'weekly';
  const limit = cat.limit_amount ? Number(cat.limit_amount) : null;
  const periodSpent = weekly && isCurrent ? sumSpend(mine.filter((x) => inRange(x, week))) : total;
  const pct = limit ? Math.round((periodSpent / limit) * 100) : null;
  const groups = groupByDay(inMonth);

  return (
    <div className="screen no-nav">
      <header className="topbar">
        <button className="round" onClick={() => history.back()} aria-label="Volver"><Icon name="back" /></button>
        <h1 className="h2 row gap8"><span aria-hidden="true">{cat.emoji}</span>{cat.name}</h1>
        <button className="round" onClick={() => go(`/categoria/${id}/editar`)} aria-label="Editar categoría"><Icon name="pencil" /></button>
      </header>

      <section className="hero small" aria-label="Total de la categoría">
        <MonthNav ym={ym} setYm={setYm} />
        <span className="muted-label">{cat.kind === 'income' ? 'Ingresos' : 'Gastado'} en {monthName(ym[1])}</span>
        <BigMoney crc={total} size={48} />
        <span className="muted-label">{inMonth.length === 1 ? '1 movimiento' : `${inMonth.length} movimientos`}</span>
      </section>

      {limit !== null && (
        <div className="card pad col gap8">
          <div className="row between small-strong">
            <span>{weekly && isCurrent ? 'Esta semana' : weekly ? 'Límite semanal' : 'Límite mensual'}</span>
            <span className={pct !== null && pct >= 100 ? 'danger' : ''}>{money(periodSpent, cur, fx)} de {money(limit, cur, fx)}</span>
          </div>
          <div className="bar"><div className="bar-fill" style={{ width: `${Math.min(pct || 0, 100)}%`, background: (pct || 0) >= 100 ? '#C8372D' : (pct || 0) >= 80 ? '#C27C00' : '#111' }} /></div>
        </div>
      )}

      {loading && txs.length === 0 ? (
        <Loading />
      ) : groups.length === 0 ? (
        <div className="card empty center">
          <span className="big-emoji">{cat.emoji}</span>
          <strong>Sin movimientos en {monthName(ym[1])}</strong>
          <span>Probá con otro mes.</span>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.label} className="col gap8">
            <div className="row between">
              <span className="date-pill">{g.label}</span>
              {g.total !== 0 && <span className="date-pill">{money(g.total, cur, fx)}</span>}
            </div>
            <div className="card list">{g.rows.map((x) => <TxRow key={x.id} t={x} />)}</div>
          </section>
        ))
      )}
    </div>
  );
}
