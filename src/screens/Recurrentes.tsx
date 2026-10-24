import { useEffect, useState } from 'react';
import { pickerOrder } from '../lib/cats';
import { namePhoto } from '../lib/merchants';
import { db } from '../lib/api';
import { money, moneyRaw, parseAmount } from '../lib/format';
import {
  addPeriod, daysUntil, dueLabel, isManual, paidRecently, FREQ_LABEL, METHOD_LABEL, needsConfirm, patternFrom, payRecurring, PER_MONTH, recState, shortDay, skipRecurring, useRecurring,
} from '../lib/recurring';
import type { Category, Currency, Frequency, PayMethod, Recurring, RecurringSuggestion } from '../lib/types';
import { go, useApp } from '../store';
import { BackBar, BigMoney, Emo, Icon, Loading, Segmented, tint } from '../ui';
import { inRange, sumSpend, weekRange } from '../lib/calc';
import { useTxs } from '../store';

/** "Netflix.com 844-5" → "Netflix" */
export function cleanName(n: string) {
  return n.replace(/(\s+\S*\d\S*)+$/, '').replace(/\.(com|net|io|app)$/i, '').trim() || n;
}

export function recEmoji(r: Recurring, categories: Category[]) {
  return categories.find((c) => c.id === r.category_id)?.emoji || (r.method === 'card' ? '💳' : '🔁');
}

/** One recurring payment as a row; transfers/cash that are due get "ya pagué / todavía no". */
export function RecRow({ r, compact = false }: { r: Recurring; compact?: boolean }) {
  const { categories, accounts, cur, fx, userId, bump, toast, merchants } = useApp();
  const photo = namePhoto(merchants, r.merchant, r.match_pattern);
  const [busy, setBusy] = useState(false);
  const cat = categories.find((c) => c.id === r.category_id);
  const state = recState(r);
  const ask = needsConfirm(r, accounts);
  const crc = r.currency === 'USD' ? Number(r.amount) * fx : Number(r.amount);

  async function paid() {
    setBusy(true);
    try {
      await payRecurring(r, fx, userId);
      toast(`✅ ${r.merchant} pagado`);
      bump();
    } catch {
      toast('No se pudo registrar');
    } finally {
      setBusy(false);
    }
  }
  async function skip() {
    setBusy(true);
    await skipRecurring(r);
    toast(`Saltado · próximo ${shortDay(addPeriod(r.next_due, r.frequency))}`);
    bump();
    setBusy(false);
  }

  return (
    <div className={ask ? 'rec-row ask' : 'rec-row'}>
      <button className="tx-row" onClick={() => go(`/recurrente/${r.id}`)}>
        <Emo e={recEmoji(r, categories)} color={!r.active ? 'gray' : state === 'overdue' ? 'pink' : cat?.color || 'gray'} img={photo} />
        <span className="tx-mid">
          <span className="tx-cat">
            {compact ? METHOD_LABEL[r.method] : `${FREQ_LABEL[r.frequency]} · ${METHOD_LABEL[r.method]}`}
          </span>
          <span className="tx-name">{r.merchant}</span>
        </span>
        <span className="tx-amt">
          <span>{r.currency === 'USD' && cur === 'CRC' ? moneyRaw(Number(r.amount), 'USD') : money(crc, cur, fx)}</span>
          <span className={state === 'overdue' ? 'tx-sub danger' : state === 'due' ? 'tx-sub strong' : 'tx-sub'}>
            {!r.active ? 'Pausado' : paidRecently(r) ? `✅ Pagado ${shortDay(r.last_paid_on!)}` : dueLabel(r.next_due)}
          </span>
        </span>
      </button>
      {ask && (
        <div className="rec-ask">
          <span>¿Ya se pagó?</span>
          <span className="row gap6">
            <button className="btn-light sm" onClick={skip} disabled={busy}>Saltar</button>
            <button className="btn-dark sm" onClick={paid} disabled={busy}>Ya pagué</button>
          </span>
        </div>
      )}
    </div>
  );
}

/** Shared spaces pay last week's card charges every Friday from the debit account. */
export function CardPayment() {
  const { space, accounts, profiles, userId, cur, fx, toast, bump } = useApp();
  const prevWeek = weekRange(space?.week_start ?? 5, -1);
  const { txs } = useTxs(space?.kind === 'shared' ? { from: prevWeek.from, to: new Date(Date.now() + 86400000).toISOString() } : null);
  const cards = accounts.filter((a) => a.kind === 'credit_card' && !a.archived);
  const cardIds = new Set(cards.map((c) => c.id));
  const owed = sumSpend(txs.filter((x) => x.account_id && cardIds.has(x.account_id) && inRange(x, prevWeek)));
  const key = `card-week:${prevWeek.startKey}`;
  if (!space || space.kind !== 'shared' || !cards.length || owed <= 0 || txs.some((x) => x.external_id === key)) return null;
  const debit = accounts.find((a) => a.kind === 'debit' && !a.archived);
  const others = Object.values(profiles).filter((p) => p.id !== userId).map((p) => p.name).filter(Boolean);
  async function paid() {
    if (!space) return;
    await db.insert('transactions', {
      space_id: space.id, kind: 'transfer', amount: Math.round(owed * 100) / 100, currency: 'CRC', occurred_at: new Date().toISOString(),
      merchant: 'Pago de tarjeta', account_id: debit?.id ?? null, to_account_id: cards[0].id, source: 'system', external_id: key,
    });
    toast('✅ Pago registrado');
    bump();
  }
  return (
    <div className="card list">
      <div className="rec-row ask">
        <div className="tx-row">
          <Emo e="💳" color="pink" />
          <span className="tx-mid">
            <span className="tx-cat">Semana pasada{others.length ? ` · ${others.join(', ')} transfiere` : ''}</span>
            <span className="tx-name">Pago de tarjeta</span>
          </span>
          <span className="tx-amt"><span>{money(owed, cur, fx)}</span><span className="tx-sub strong">Toca pagar</span></span>
        </div>
        <div className="rec-ask">
          <span>¿Ya se pagó la tarjeta?</span>
          <button className="btn-dark sm" onClick={paid}>Ya pagué</button>
        </div>
      </div>
    </div>
  );
}

export function Recurrentes() {
  const { space, cur, fx, categories, accounts, toast, bump } = useApp();
  const { items, loading } = useRecurring(space?.id);
  const [sugs, setSugs] = useState<RecurringSuggestion[]>([]);
  const [filter, setFilter] = useState<RecFilter>(() => {
    try {
      return (sessionStorage.getItem('finanzas.rec.filter') as RecFilter) || 'todos';
    } catch {
      return 'todos';
    }
  });
  const pick = (f: RecFilter) => {
    setFilter(f);
    try {
      sessionStorage.setItem('finanzas.rec.filter', f);
    } catch {
      /* storage unavailable */
    }
  };
  const { version } = useApp();

  useEffect(() => {
    if (!space) return;
    db.rpc<RecurringSuggestion[]>('recurring_suggestions', { p_space: space.id }).then(setSugs).catch(() => setSugs([]));
  }, [space, version]);

  if (!space) return <Loading />;
  const active = items.filter((r) => r.active);
  const paused = items.filter((r) => !r.active);
  const monthly = active.reduce((a, r) => a + (r.currency === 'USD' ? Number(r.amount) * fx : Number(r.amount)) * PER_MONTH[r.frequency], 0);
  const toConfirm = active.filter((r) => needsConfirm(r, accounts));
  const rest = active.filter((r) => !needsConfirm(r, accounts));

  // filter chips: only the ones that would show something, with their count
  const tests: Record<RecFilter, (r: Recurring) => boolean> = {
    todos: () => true,
    proximos: (r) => r.active && daysUntil(r.next_due) <= 30,
    pendientes: (r) => needsConfirm(r, accounts),
    weekly: (r) => r.active && r.frequency === 'weekly',
    biweekly: (r) => r.active && r.frequency === 'biweekly',
    monthly: (r) => r.active && r.frequency === 'monthly',
    bimonthly: (r) => r.active && r.frequency === 'bimonthly',
    quarterly: (r) => r.active && r.frequency === 'quarterly',
    semiannual: (r) => r.active && r.frequency === 'semiannual',
    yearly: (r) => r.active && r.frequency === 'yearly',
    tarjeta: (r) => r.active && !isManual(r),
    manual: (r) => r.active && isManual(r),
    pausados: (r) => !r.active,
  };
  const chips = (Object.keys(FILTER_LABEL) as RecFilter[])
    .map((k) => [k, items.filter(tests[k]).length] as const)
    .filter(([k, n]) => k === 'todos' || n > 0);
  const current = chips.some(([k]) => k === filter) ? filter : 'todos';
  const shown = items.filter(tests[current]).sort((a, b) => Number(b.active) - Number(a.active) || a.next_due.localeCompare(b.next_due));
  const perMonth = (r: Recurring) => (r.currency === 'USD' ? Number(r.amount) * fx : Number(r.amount)) * PER_MONTH[r.frequency];
  const yearlyOnly = current === 'yearly';
  // due-soon filters add up what's actually coming; the rest compare as a monthly (or yearly) cost
  const dueSum = current === 'proximos' || current === 'pendientes';
  const one = (r: Recurring) => (r.currency === 'USD' ? Number(r.amount) * fx : Number(r.amount));
  const headerTotal = current === 'todos' ? monthly : shown.filter((r) => r.active).reduce((a, r) => a + (dueSum ? one(r) : yearlyOnly ? perMonth(r) * 12 : perMonth(r)), 0);
  const headerLabel = current === 'todos' ? 'Total al mes' : dueSum ? `${FILTER_LABEL[current]} · a pagar` : yearlyOnly ? 'Anuales · al año' : `${FILTER_LABEL[current]} · al mes`;

  async function addSuggestion(s: RecurringSuggestion) {
    if (!space) return;
    await db.insert('recurring', {
      space_id: space.id,
      kind: 'expense',
      amount: s.amount,
      currency: s.currency,
      category_id: s.category_id,
      account_id: s.account_id,
      merchant: cleanName(s.merchant || s.merchant_key),
      frequency: 'monthly',
      next_due: s.next_guess,
      method: 'card',
      match_pattern: patternFrom(s.raw_merchant || s.merchant_key),
      last_paid_on: s.last_date,
    });
    toast(`🔁 ${cleanName(s.merchant || s.merchant_key)} agregado a recurrentes`);
    bump();
  }
  async function dismiss(s: RecurringSuggestion) {
    if (!space) return;
    await db.insert('recurring_dismissals', { space_id: space.id, merchant_key: s.merchant_key });
    setSugs((x) => x.filter((y) => y.merchant_key !== s.merchant_key));
  }

  return (
    <div className="screen no-nav">
      <BackBar title="Recurrentes" />
      <CardPayment />
      <section className="col gap6 px4">
        <span className="muted-label">{headerLabel}</span>
        <BigMoney crc={headerTotal} size={52} />
        <span className="muted small">
          {current === 'todos' ? (active.length === 1 ? '1 pago activo' : `${active.length} pagos activos`) : shown.length === 1 ? '1 pago' : `${shown.length} pagos`}
        </span>
      </section>

      {items.length > 0 && (
        <div className="hscroll rec-filters" role="toolbar" aria-label="Filtrar recurrentes">
          {chips.map(([k, n]) => (
            <button key={k} className={current === k ? 'filter on' : 'filter'} aria-pressed={current === k} onClick={() => pick(k)}>
              {FILTER_LABEL[k]}{k !== 'todos' && <span className="filter-n">{n}</span>}
            </button>
          ))}
        </div>
      )}

      <a className="action dark self-start" href="#/recurrente/nueva"><span>➕</span>Nuevo recurrente</a>

      {current !== 'todos' ? (
        <section className="col gap8">
          <div className="card list">{shown.map((r) => <RecRow key={r.id} r={r} />)}</div>
        </section>
      ) : (
      <>
      {sugs.length > 0 && (
        <section className="col gap8">
          <h2 className="h3 px4">✨ ¿Son suscripciones?</h2>
          <div className="card list">
            {sugs.map((s) => {
              const cat = categories.find((c) => c.id === s.category_id);
              const crc = s.currency === 'USD' ? Number(s.amount) * fx : Number(s.amount);
              return (
                <div key={s.merchant_key} className="sug-row">
                  <Emo e={cat?.emoji || '🔁'} color={cat?.color || 'lilac'} size={44} />
                  <span className="tx-mid">
                    <span className="tx-name">{cleanName(s.merchant || s.merchant_key)}</span>
                    <span className="tx-cat">
                      {s.currency === 'USD' ? moneyRaw(Number(s.amount), 'USD') : money(crc, cur, fx)} · {s.months} meses
                    </span>
                  </span>
                  <span className="row gap6">
                    <button className="btn-light sm" onClick={() => dismiss(s)} aria-label={`${s.merchant} no es recurrente`}>No</button>
                    <button className="btn-dark sm" onClick={() => addSuggestion(s)}>Agregar</button>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {toConfirm.length > 0 && (
        <section className="col gap8">
          <h2 className="h3 px4">⏰ Pagos pendientes</h2>
          <div className="card list">{toConfirm.map((r) => <RecRow key={r.id} r={r} />)}</div>
        </section>
      )}

      <section className="col gap8">
        <h2 className="h3 px4">Próximos</h2>
        {loading && items.length === 0 ? (
          <Loading />
        ) : rest.length === 0 && toConfirm.length === 0 ? (
          <a className="card empty center" href="#/recurrente/nueva">
            <span className="big-emoji">🔁</span>
            <strong>Agregá tus pagos fijos</strong>
            <span>Alquiler, internet, Netflix… Los de tarjeta se marcan solos cuando llega el voucher.</span>
          </a>
        ) : (
          <div className="card list">{rest.map((r) => <RecRow key={r.id} r={r} />)}</div>
        )}
      </section>

      {paused.length > 0 && (
        <section className="col gap8">
          <h2 className="h3 px4">Pausados</h2>
          <div className="card list">{paused.map((r) => <RecRow key={r.id} r={r} />)}</div>
        </section>
      )}
      </>
      )}
    </div>
  );
}

type RecFilter = 'todos' | 'proximos' | 'pendientes' | Frequency | 'tarjeta' | 'manual' | 'pausados';
const FILTER_LABEL: Record<RecFilter, string> = {
  todos: 'Todos',
  proximos: 'Próximos 30 días',
  pendientes: 'Pendientes',
  weekly: 'Semanales',
  biweekly: 'Quincenales',
  monthly: 'Mensuales',
  bimonthly: 'Cada 2 meses',
  quarterly: 'Trimestrales',
  semiannual: 'Semestrales',
  yearly: 'Anuales',
  tarjeta: 'Con tarjeta',
  manual: 'Pago manual',
  pausados: 'Pausados',
};

/** 350000 → "350.000" while typing (dots for thousands, comma for decimals). */
function fmtInput(v: string) {
  const [i, d] = v.replace(/[^0-9,]/g, '').split(',');
  const int = (i || '').replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return d !== undefined ? `${int},${d.slice(0, 2)}` : int;
}

const FREQS: Frequency[] = ['weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'yearly'];

export function RecurringEdit({ id }: { id: string }) {
  const { space, categories, accounts, toast, bump } = useApp();
  const isNew = id === 'nueva';
  const [r, setR] = useState<Partial<Recurring>>({
    merchant: '', currency: 'CRC', frequency: 'monthly', method: 'card', active: true, kind: 'expense',
    next_due: new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10),
  });
  const [amount, setAmount] = useState('');
  const [pattern, setPattern] = useState('');
  const [patternTouched, setPatternTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isNew) return;
    db.from<Recurring>('recurring').eq('id', id).then(([x]) => {
      if (!x) return;
      setR(x);
      setAmount(fmtInput(String(Number(x.amount)).replace('.', ',')));
      setPattern(x.match_pattern || '');
      setPatternTouched(true);
    });
  }, [id, isNew]);

  if (!space) return <Loading />;
  const set = <K extends keyof Recurring>(k: K, v: Recurring[K]) => setR((x) => ({ ...x, [k]: v }));
  const expenseCats = pickerOrder(categories.filter((c) => c.kind === 'expense' && !c.archived));
  const spaceAccounts = accounts.filter((a) => !a.archived && (r.method === 'card' ? a.kind === 'credit_card' || a.kind === 'debit' : a.kind !== 'credit_card'));
  const effectivePattern = patternTouched ? pattern : patternFrom(r.merchant);

  async function save() {
    if (!space || !r.merchant?.trim() || !parseAmount(amount) || !r.next_due) return;
    setBusy(true);
    const row = {
      space_id: space.id,
      kind: 'expense',
      merchant: r.merchant.trim(),
      amount: parseAmount(amount),
      currency: r.currency,
      category_id: r.category_id || null,
      account_id: r.account_id || null,
      frequency: r.frequency,
      next_due: r.next_due,
      method: r.method,
      match_pattern: effectivePattern.trim().toUpperCase() || null,
      active: r.active,
      notes: r.notes || null,
    };
    try {
      if (isNew) await db.insert('recurring', row);
      else await db.update('recurring', { id }, row);
      bump();
      toast('✅ Recurrente guardado');
      history.back();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!confirm('¿Eliminar este recurrente? Los pagos ya registrados se quedan.')) return;
    await db.remove('recurring', { id });
    bump();
    toast('Recurrente eliminado');
    go('/recurrentes');
  }

  return (
    <div className="screen no-nav">
      <header className="topbar">
        <button className="round" onClick={() => history.back()} aria-label="Volver"><Icon name="back" /></button>
        <h1 className="h2">{isNew ? 'Nuevo recurrente' : 'Editar recurrente'}</h1>
        <span style={{ width: 48 }} />
      </header>

      <div className="card pad col gap14">
        <label className="col gap6"><span className="field-label">Nombre</span>
          <input className="input" value={r.merchant || ''} onChange={(e) => set('merchant', e.target.value)} placeholder="Ej. Alquiler, Netflix, Internet" />
        </label>
        <div className="col gap6">
          <span className="field-label">Monto esperado</span>
          <div className="row gap8">
            <label className="amount-input small grow">
              <span className="amount-sym">{r.currency === 'USD' ? '$' : '¢'}</span>
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(fmtInput(e.target.value))} placeholder="0" aria-label="Monto" />
            </label>
            <Segmented value={(r.currency || 'CRC') as Currency} options={[['CRC', '¢'], ['USD', '$']]} onChange={(v) => set('currency', v)} dark={false} />
          </div>
        </div>
        <label className="col gap6"><span className="field-label">Cada cuánto</span>
          <select className="input" value={r.frequency} onChange={(e) => set('frequency', e.target.value as Frequency)}>
            {FREQS.map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}
          </select>
        </label>
        <label className="col gap6"><span className="field-label">Próximo pago</span>
          <input className="input" type="date" value={r.next_due || ''} onChange={(e) => set('next_due', e.target.value)} />
        </label>
      </div>

      <div className="card pad col gap14">
        <span className="field-label">Cómo se paga</span>
        <Segmented value={(r.method || 'card') as PayMethod} options={[['card', 'Tarjeta'], ['transfer', 'Transferencia'], ['cash', 'Efectivo']]} onChange={(v) => set('method', v)} dark={false} />
        <span className="hint">
          {r.method === 'card'
            ? 'Cobro automático: se marca como pagado solo cuando llega el voucher de la tarjeta (crédito o débito).'
            : 'Pago manual: aparece en Pagos pendientes en el inicio desde unos días antes, y se queda ahí hasta que confirmés que lo pagaste.'}
        </span>
        {r.method === 'card' && (
          <label className="col gap6"><span className="field-label">Cómo aparece en el voucher</span>
            <input className="input" value={effectivePattern} onChange={(e) => { setPattern(e.target.value.toUpperCase()); setPatternTouched(true); }} placeholder="NETFLIX" />
            <span className="hint">Basta con una palabra que siempre aparezca, por ejemplo NETFLIX o SPOTIFY.</span>
          </label>
        )}
        <label className="col gap6"><span className="field-label">{r.method === 'card' ? 'Tarjeta' : 'Desde qué cuenta'}</span>
          <select className="input" value={r.account_id || ''} onChange={(e) => set('account_id', e.target.value || null)}>
            <option value="">Sin especificar</option>
            {spaceAccounts.map((a) => <option key={a.id} value={a.id}>{a.emoji} {a.name}{a.last4 ? ` ••${a.last4}` : ''}</option>)}
          </select>
        </label>
      </div>

      <div className="card pad col gap10">
        <span className="field-label">Categoría</span>
        <div className="cat-grid">
          {expenseCats.map((c) => (
            <button key={c.id} className={r.category_id === c.id ? 'cat-tile on' : 'cat-tile'} aria-pressed={r.category_id === c.id} style={{ background: tint(c.color, r.category_id === c.id) }} onClick={() => set('category_id', r.category_id === c.id ? null : c.id)}>
              <span className="cat-emoji">{c.emoji}</span>
              <span>
                {c.name}
                {c.parent_id && <span className="cat-parent">{categories.find((p) => p.id === c.parent_id)?.name}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>

      {!isNew && (
        <div className="field-row card pad">
          <span className="col"><span>Activo</span><small>Pausalo si ya no se paga, sin perder el historial</small></span>
          <button role="switch" aria-checked={!!r.active} aria-label="Activo" className={r.active ? 'switch on' : 'switch'} onClick={() => set('active', !r.active)}><span /></button>
        </div>
      )}

      <button className="btn-dark big" onClick={save} disabled={busy || !r.merchant?.trim() || !parseAmount(amount)}>{busy ? 'Guardando…' : 'Guardar'}</button>
      {!isNew && r.last_paid_on && <span className="muted small center-text">Último pago registrado: {shortDay(r.last_paid_on)}</span>}
      {!isNew && <button className="btn-danger" onClick={remove}><Icon name="trash" size={18} /> Eliminar recurrente</button>}
    </div>
  );
}
