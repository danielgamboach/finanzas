import { useMenu } from '../lib/menu';
import { useEffect, useMemo, useState } from 'react';
import { BalanceSummary, Button, Chip, EmptyState, GroupSkeleton, ListGroup, ListRow, Loader, PageHeader, SummarySkeleton, Switch, ActionBar } from '../ds';
import { FormPageSkeleton, PageSkeleton } from '../ui/Skeletons';
import { pickerOrder } from '../lib/cats';
import { namePhoto } from '../lib/merchants';
import { db } from '../lib/api';
import { amount, money, moneyRaw, parseAmount, unitOf } from '../lib/format';
import {
  daysUntil, dueDay, dueLabel, isManual, paidRecently, FREQ_LABEL, freqLabel, needsConfirm, patternFrom, perMonth as perMonthOf, recState, shortDay, useRecurring,
} from '../lib/recurring';
import type { Account, Category, Currency, EveryUnit, Frequency, Recurring, RecurringSuggestion } from '../lib/types';
import { PaySheet } from '../ui/PaySheet';
import { canPay, canReceiveIncome, canSendMoney } from '../lib/transfers';
import { go, navigateBack, useApp } from '../store';
import { Emo, Icon, Loading, Segmented } from '../ui';
import { inRange, sumSpend, weekRange } from '../lib/calc';
import { useTxs } from '../store';

/** "Netflix.com 844-5" → "Netflix" */
export function cleanName(n: string) {
  return n.replace(/(\s+\S*\d\S*)+$/, '').replace(/\.(com|net|io|app)$/i, '').trim() || n;
}

/** The face of a recurring payment: its category's emoji, or an icon (card or repeat) when it has none. */
export function recFace(r: Recurring, categories: Category[]): { emoji?: string; icon?: string } {
  const e = categories.find((c) => c.id === r.category_id)?.emoji;
  return e ? { emoji: e } : { icon: r.kind === 'transfer' ? 'exchange' : !isManual(r) ? 'cards' : 'repeat' };
}

/** One recurring payment as a row; a manual one that's due gets "Pagar" (from which account, or postpone or ignore it). */
export function RecRow({ r, compact = false }: { r: Recurring; compact?: boolean }) {
  const { categories, accounts, cur, fx, merchants } = useApp();
  const photo = namePhoto(merchants, r.merchant, r.match_pattern);
  const [paying, setPaying] = useState(false);
  const cat = categories.find((c) => c.id === r.category_id);
  const state = recState({ ...r, next_due: dueDay(r) });
  const ask = needsConfirm(r, accounts);
  const crc = r.currency === 'USD' ? Number(r.amount) * fx : Number(r.amount);

  const amountNode = <>{r.variable ? '≈ ' : ''}{r.currency === 'USD' && cur === 'CRC' ? <>{amount(Number(r.amount), 'USD', 1)}<span className="amt-unit"> USD</span></> : <>{amount(crc, cur, fx)}<span className="amt-unit"> {unitOf(cur)}</span></>}</>;
  const when = !r.active ? 'Pausado' : paidRecently(r) ? `Pagado ${shortDay(r.last_paid_on!)}` : dueLabel(dueDay(r));
  const mode = isManual(r) ? 'Manual' : 'Automático';
  const how = compact ? mode : `${freqLabel(r)} · ${mode}`;
  return (
    <>
      <ListRow
        leading={<Emo e={recFace(r, categories).emoji} icon={recFace(r, categories).icon} color={!r.active ? 'gray' : cat?.color || 'gray'} img={photo} size={40} />}
        title={r.merchant}
        detail={`${how}${r.variable ? ' · Varía' : ''}`}
        value={amountNode}
        valueDetail={when}
        valueDetailTone={state === 'overdue' ? 'destructive' : paidRecently(r) ? 'success' : state === 'due' ? 'default' : 'muted'}
        quiet={!r.active}
        href={`#/recurrente/${r.id}`}
        label={`${r.merchant}, ${when}`}
        below={ask ? (
          <div className="rec-ask">
            <span>{r.kind === 'income' ? '¿Ya entró?' : isManual(r) ? '¿Ya se pagó?' : '¿Ya se cobró?'}</span>
            <Button variant="primary" size="xs" onClick={() => setPaying(true)}>{r.kind === 'income' ? 'Cobré' : isManual(r) ? 'Pagar' : 'Sí, se cobró'}</Button>
          </div>
        ) : undefined}
      />
      {paying && <PaySheet r={r} onClose={() => setPaying(false)} onPaid={() => undefined} />}
    </>
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

  const menu = useMenu();
  if (!space) return <PageSkeleton title="Recurrentes" back={!menu} nav={false}><GroupSkeleton rows={2} action value={false} /><GroupSkeleton rows={3} /></PageSkeleton>;
  const active = items.filter((r) => r.active);
  const paused = items.filter((r) => !r.active);
  const monthly = active.filter((r) => r.kind !== 'income' && r.kind !== 'transfer').reduce((a, r) => a + (r.currency === 'USD' ? Number(r.amount) * fx : Number(r.amount)) * perMonthOf(r), 0);
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
    custom: (r) => r.active && r.frequency === 'custom',
    tarjeta: (r) => r.active && !isManual(r),
    manual: (r) => r.active && isManual(r),
    pausados: (r) => !r.active,
  };
  const chips = (Object.keys(FILTER_LABEL) as RecFilter[])
    .map((k) => [k, items.filter(tests[k]).length] as const)
    .filter(([k, n]) => k === 'todos' || n > 0);
  const current = chips.some(([k]) => k === filter) ? filter : 'todos';
  const shown = items.filter(tests[current]).sort((a, b) => Number(b.active) - Number(a.active) || a.next_due.localeCompare(b.next_due));
  const perMonth = (r: Recurring) => (r.currency === 'USD' ? Number(r.amount) * fx : Number(r.amount)) * perMonthOf(r);
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
      auto: true,
      // an Apple subscription comes without bank name: its key ("YOUTUBE") is the pattern
      match_pattern: s.raw_merchant ? patternFrom(s.raw_merchant) : s.merchant_key,
      last_paid_on: s.last_date,
    });
    toast(`${cleanName(s.merchant || s.merchant_key)} agregado a recurrentes`);
    bump();
  }
  async function dismiss(s: RecurringSuggestion) {
    if (!space) return;
    await db.insert('recurring_dismissals', { space_id: space.id, merchant_key: s.merchant_key });
    setSugs((x) => x.filter((y) => y.merchant_key !== s.merchant_key));
  }

  const count = current === 'todos' ? active.length : shown.length;
  return (
    <div className="page no-nav">
      <PageHeader
        title="Recurrentes"
        onBack={menu ? undefined : navigateBack}
        onMenu={menu?.open}
        actions={<Button variant="secondary" size="xs" iconOnly onClick={() => go('/agregar?planear=1')} aria-label="Nuevo recurrente"><Icon name="plus" size={16} solid /></Button>}
      />
      <div className="page-hero">
        {loading && items.length === 0 ? <Loader><SummarySkeleton /></Loader> : <BalanceSummary
          label={headerLabel}
          value={amount(headerTotal, cur, fx)}
          unit={unitOf(cur)}
          meta={`${count} ${count === 1 ? (current === 'todos' ? 'pago activo' : 'pago') : current === 'todos' ? 'pagos activos' : 'pagos'}`}
        />}
      </div>

      {items.length > 0 && (
        <div className="page-chips" role="toolbar" aria-label="Filtrar recurrentes">
          {chips.map(([k, n]) => (
            <Chip key={k} selected={current === k} size="sm" count={k !== 'todos' ? n : undefined} onClick={() => pick(k)}>{FILTER_LABEL[k]}</Chip>
          ))}
        </div>
      )}

      <div className="page-body">
        {current !== 'todos' ? (
          <ListGroup>{shown.map((r) => <RecRow key={r.id} r={r} />)}</ListGroup>
        ) : (
          <>

            {sugs.length > 0 && (
              <ListGroup title="¿Son suscripciones?" note="Cobros que se repiten cada mes. Agregalos para verlos venir.">
                {sugs.map((s) => {
                  const cat = categories.find((c) => c.id === s.category_id);
                  const crc = s.currency === 'USD' ? Number(s.amount) * fx : Number(s.amount);
                  const name = cleanName(s.merchant || s.merchant_key);
                  return (
                    <ListRow
                      key={s.merchant_key}
                      leading={<Emo e={cat?.emoji} icon={cat?.emoji ? undefined : 'repeat'} color={cat?.color || 'lilac'} size={40} />}
                      title={name}
                      detail={`${s.currency === 'USD' ? moneyRaw(Number(s.amount), 'USD') : money(crc, cur, fx)} · ${s.months} meses`}
                      actions={
                        <>
                          <Button variant="secondary" size="xs" onClick={() => dismiss(s)} aria-label={`${name}: no es recurrente`}>No</Button>
                          <Button variant="primary" size="xs" onClick={() => addSuggestion(s)} aria-label={`Agregar ${name}`}>Agregar</Button>
                        </>
                      }
                    />
                  );
                })}
              </ListGroup>
            )}

            {toConfirm.length > 0 && (
              <ListGroup title="Pagos pendientes" count={toConfirm.length}>{toConfirm.map((r) => <RecRow key={r.id} r={r} />)}</ListGroup>
            )}

            {loading && items.length === 0 ? (
              <Loader><GroupSkeleton rows={4} /></Loader>
            ) : rest.length === 0 && toConfirm.length === 0 ? (
              <EmptyState icon={<Icon name="repeat" size={24} />} title="Agregá tus pagos fijos" action={<Button variant="primary" size="sm" onClick={() => go('/agregar?planear=1')} leading={<Icon name="plus" size={16} solid />}>Nuevo recurrente</Button>}>
                Alquiler, internet, Netflix… Los de tarjeta se marcan solos cuando llega el voucher.
              </EmptyState>
            ) : rest.length > 0 ? (
              <ListGroup title="Próximos">{rest.map((r) => <RecRow key={r.id} r={r} />)}</ListGroup>
            ) : null}

            {paused.length > 0 && <ListGroup title="Pausados">{paused.map((r) => <RecRow key={r.id} r={r} />)}</ListGroup>}
          </>
        )}
      </div>
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
  custom: 'Personalizados',
  tarjeta: 'Automáticos',
  manual: 'Pago manual',
  pausados: 'Pausados',
};

/** 350000 → "350.000" while typing (dots for thousands, comma for decimals). */
function fmtInput(v: string) {
  const [i, d] = v.replace(/[^0-9,]/g, '').split(',');
  const int = (i || '').replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return d !== undefined ? `${int},${d.slice(0, 2)}` : int;
}

const FREQS: Frequency[] = ['weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'yearly', 'custom'];
const UNITS: [EveryUnit, string][] = [['day', 'días'], ['week', 'semanas'], ['month', 'meses']];
const KIND_OPTS: [Recurring['kind'], string][] = [['expense', 'Gasto'], ['income', 'Ingreso'], ['transfer', 'Mover dinero']];

/** Accounts grouped by space, this space first. */
function groupBySpace(accs: Account[], first: string): [string, Account[]][] {
  const m = new Map<string, Account[]>();
  for (const a of accs) m.set(a.space_id, [...(m.get(a.space_id) || []), a]);
  return [...m.entries()].sort(([a], [b]) => Number(b === first) - Number(a === first));
}

export function RecurringEdit({ id, preset }: { id: string; preset?: string }) {
  const { space, spaces, categories, accounts, toast, bump } = useApp();
  const spacesById = Object.fromEntries(spaces.map((s) => [s.id, s]));
  const isNew = id === 'nueva';
  // from Presupuesto → Planear: an income or a saving starts as a manual payment of that kind (PRM-03)
  const [r, setR] = useState<Partial<Recurring>>({
    merchant: preset === 'ingreso' ? 'Salario' : preset === 'ahorro' ? 'Ahorro' : '', currency: 'CRC', frequency: 'monthly', active: true,
    ...(preset === 'ingreso' ? { kind: 'income', method: 'transfer', auto: false } : preset === 'ahorro' ? { kind: 'transfer', method: 'transfer', auto: false } : { kind: 'expense', method: 'card', auto: true }),
    next_due: new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10),
  });
  // every account the person can reach: a recurring transfer can go to a shared space's account
  const [allAccs, setAllAccs] = useState<Account[]>([]);
  useEffect(() => {
    db.from<Account>('accounts').eq('archived', false).order('created_at').then(setAllAccs, () => setAllAccs([]));
  }, []);
  const [amount, setAmount] = useState('');
  const [pattern, setPattern] = useState('');
  const [patternTouched, setPatternTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isNew) return;
    db.from<Recurring>('recurring').eq('id', id).then(([x]) => {
      if (!x) return;
      setR({ ...x, auto: x.auto ?? x.method === 'card' });
      setAmount(fmtInput(String(Number(x.amount)).replace('.', ',')));
      setPattern(x.match_pattern || '');
      setPatternTouched(true);
    });
  }, [id, isNew]);

  if (!space) return <FormPageSkeleton title="Recurrente" />;
  const set = <K extends keyof Recurring>(k: K, v: Recurring[K]) => setR((x) => ({ ...x, [k]: v }));
  const kind = (r.kind === 'contribution' ? 'transfer' : r.kind) || 'expense';
  const kindCats = pickerOrder(categories.filter((c) => c.kind === (kind === 'income' ? 'income' : 'expense') && !c.archived));
  const spaceAccounts = accounts.filter((a) => !a.archived && (kind === 'income' ? canReceiveIncome(a) : kind === 'transfer' ? canSendMoney(a) : canPay(a)));
  const cash = accounts.find((a) => a.system === 'cash');
  const fromId = r.account_id || cash?.id || '';
  const destinations = allAccs.filter((a) => a.id !== fromId);
  const effectivePattern = patternTouched ? pattern : patternFrom(r.merchant);
  const custom = r.frequency === 'custom';
  const ready = !!r.merchant?.trim() && !!parseAmount(amount) && !!r.next_due && (kind !== 'transfer' || !!r.to_account_id) && (!custom || (Number(r.every_n) > 0 && !!r.every_unit));

  async function save() {
    if (!space || !ready || !r.merchant || !r.next_due) return;
    setBusy(true);
    const acc = accounts.find((a) => a.id === fromId);
    const row = {
      space_id: space.id,
      kind,
      merchant: r.merchant.trim(),
      amount: parseAmount(amount),
      currency: r.currency,
      category_id: kind === 'transfer' ? null : r.category_id || null,
      account_id: fromId || null,
      to_account_id: kind === 'transfer' ? r.to_account_id || null : null,
      frequency: r.frequency,
      every_n: custom ? Number(r.every_n) : null,
      every_unit: custom ? r.every_unit : null,
      next_due: r.next_due,
      auto: !!r.auto,
      // how it's paid, for the voucher matching: automatic on a card is a card charge
      method: r.auto && (acc?.kind === 'credit_card' || acc?.kind === 'debit' || acc?.kind === 'savings') ? 'card' : acc?.kind === 'cash' ? 'cash' : 'transfer',
      match_pattern: effectivePattern.trim().toUpperCase() || null,
      active: r.active,
      notes: r.notes || null,
      variable: !!r.variable,
    };
    try {
      if (isNew) await db.insert('recurring', row);
      else await db.update('recurring', { id }, row);
      bump();
      toast('Recurrente guardado');
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
    <div className="page no-nav">
      <PageHeader title={isNew ? 'Nuevo recurrente' : 'Editar recurrente'} onBack={navigateBack} />
      <div className="page-body">

      <div className="card pad col gap14">
        <label className="col gap6"><span className="field-label">Nombre</span>
          <input className="input" value={r.merchant || ''} onChange={(e) => set('merchant', e.target.value)} placeholder="Ej. Alquiler, Netflix, Internet" />
        </label>
        <div className="col gap6">
          <span className="field-label">{r.variable ? 'Monto aproximado' : 'Monto esperado'}</span>
          <div className="row gap8">
            <label className="amount-input small grow">
              <span className="amount-sym">{r.currency === 'USD' ? '$' : '¢'}</span>
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(fmtInput(e.target.value))} placeholder="0" aria-label="Monto" />
            </label>
            <Segmented value={(r.currency || 'CRC') as Currency} options={[['CRC', '¢'], ['USD', '$']]} onChange={(v) => set('currency', v)} dark={false} />
          </div>
        </div>
        <div className="field-row bare">
          <span className="col">
            <span>Monto variable</span>
            <small>{r.variable ? 'Se reconoce aunque cambie el monto. El monto se actualiza solo con el promedio de los últimos 3 pagos.' : 'Para luz, agua o internet, que cambian cada mes'}</small>
          </span>
          <Switch checked={!!r.variable} label="Monto variable" onChange={() => set('variable', !r.variable)} />
        </div>
        <label className="col gap6"><span className="field-label">Cada cuánto</span>
          <select className="input" value={r.frequency} onChange={(e) => {
            const f = e.target.value as Frequency;
            setR((x) => ({ ...x, frequency: f, every_n: f === 'custom' ? x.every_n || 10 : x.every_n, every_unit: f === 'custom' ? x.every_unit || 'day' : x.every_unit }));
          }}>
            {FREQS.map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}
          </select>
        </label>
        {custom && (
          <div className="row gap8 rec-every">
            <span className="field-label">Cada</span>
            <input className="input" inputMode="numeric" value={r.every_n ?? ''} onChange={(e) => set('every_n', Number(e.target.value.replace(/\D/g, '').slice(0, 3)) || null)} aria-label="Cada cuántos" />
            <select className="input" value={r.every_unit || 'day'} onChange={(e) => set('every_unit', e.target.value as EveryUnit)} aria-label="Unidad">
              {UNITS.map(([u, l]) => <option key={u} value={u}>{l}</option>)}
            </select>
          </div>
        )}
        <label className="col gap6"><span className="field-label">Próximo pago</span>
          <input className="input" type="date" value={r.next_due || ''} onChange={(e) => set('next_due', e.target.value)} />
        </label>
      </div>

      <div className="card pad col gap14">
        <span className="field-label">Qué es</span>
        <Segmented value={kind} options={KIND_OPTS} onChange={(v) => setR((x) => ({ ...x, kind: v, category_id: null, to_account_id: v === 'transfer' ? x.to_account_id : null }))} dark={false} />
        <span className="field-label">Cómo se paga</span>
        <Segmented value={r.auto ? 'auto' : 'manual'} options={[['auto', 'Cargo automático'], ['manual', 'Pago manual']]} onChange={(v) => set('auto', v === 'auto')} dark={false} />
        <span className="hint">
          {r.auto
            ? 'El banco lo cobra solo. Ese día se registra en la cuenta sin que hagas nada. Si la cuenta recibe vouchers del banco, espera el voucher hasta el día siguiente.'
            : 'Lo pagás vos. Aparece en Inicio desde el día antes, con un botón para registrar desde qué cuenta lo pagaste.'}
        </span>
        <label className="col gap6"><span className="field-label">{kind === 'income' ? 'Entra a' : 'Sale de'}</span>
          <select className="input" value={fromId} onChange={(e) => set('account_id', e.target.value || null)}>
            {spaceAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.last4 ? ` ••${a.last4}` : ''}</option>)}
          </select>
        </label>
        {kind === 'transfer' && (
          <label className="col gap6"><span className="field-label">Hacia</span>
            <select className="input" value={r.to_account_id || ''} onChange={(e) => set('to_account_id', e.target.value || null)}>
              <option value="" disabled>Elegir cuenta</option>
              {groupBySpace(destinations, space.id).map(([sp, list]) => (
                <optgroup key={sp} label={sp === space.id ? space.name : `${spacesById[sp]?.name || 'Otro espacio'}`}>
                  {list.map((a) => <option key={a.id} value={a.id}>{a.name}{a.last4 ? ` ••${a.last4}` : ''}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
        )}
        {r.auto && kind === 'expense' && (
          <label className="col gap6"><span className="field-label">Cómo aparece en el voucher (opcional)</span>
            <input className="input" value={effectivePattern} onChange={(e) => { setPattern(e.target.value.toUpperCase()); setPatternTouched(true); }} placeholder="NETFLIX" />
            <span className="hint">Solo si recibís vouchers del banco: una palabra que siempre aparezca, por ejemplo NETFLIX.</span>
          </label>
        )}
      </div>

      {kind !== 'transfer' && (
        <div className="card pad col gap10">
          <span className="field-label">Categoría</span>
          <div className="cat-grid">
            {kindCats.map((c) => (
              <button key={c.id} className={r.category_id === c.id ? 'cat-tile on' : 'cat-tile'} aria-pressed={r.category_id === c.id} onClick={() => set('category_id', r.category_id === c.id ? null : c.id)}>
                <span className="cat-emoji">{c.emoji}</span>
                <span>
                  {c.name}
                  {c.parent_id && <span className="cat-parent">{categories.find((p) => p.id === c.parent_id)?.name}</span>}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!isNew && (
        <div className="field-row card pad">
          <span className="col"><span>Activo</span><small>Pausalo si ya no se paga, sin perder el historial</small></span>
          <Switch checked={!!r.active} label="Activo" onChange={() => set('active', !r.active)} />
        </div>
      )}

      {!isNew && r.last_paid_on && <p className="page-text">Último pago registrado: {shortDay(r.last_paid_on)}</p>}
      </div>
      {!isNew && (
        <div className="page-actions">
          <Button variant="ghost" size="md" block className="danger" leading={<Icon name="trash" size={16} />} onClick={remove}>Eliminar recurrente</Button>
        </div>
      )}
      <ActionBar>
        <Button variant="primary" size="lg" block onClick={save} disabled={busy || !ready}>{busy ? 'Guardando…' : 'Guardar'}</Button>
      </ActionBar>
    </div>
  );
}
