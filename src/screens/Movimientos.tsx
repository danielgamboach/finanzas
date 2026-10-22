import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../lib/api';
import { spend, sumKind, sumSpend, tagsOf } from '../lib/calc';
import { customKey, customParts, periodRange, PRESETS, recentMonths, usePeriod, type PeriodKey } from '../lib/period';
import { money } from '../lib/format';
import { catLabel, familyIds, pickerOrder } from '../lib/cats';
import { byKind } from '../lib/accounts';
import { useApp, useTxs } from '../store';
import { Icon, Loading, Segmented, Sheet } from '../ui';
import { TxRow, TxTableRow } from '../ui/TxRow';
import { groupByDay } from './Home';

type Kind = 'todos' | 'gastos' | 'ingresos';
interface Filters { kind: Kind; review: boolean; rec: boolean; cat: string; acc: string; tag: string }
const EMPTY: Filters = { kind: 'todos', review: false, rec: false, cat: '', acc: '', tag: '' };
const todayStr = () => new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10);

/**
 * Every movement of the space: a search field, one "Filtros" button and the active filters as
 * removable chips. All the options live in the filter sheet (period, type, category, account, tag).
 * Lives inside the home sheet (white) and inside an account's view (dark, with `accountId` fixed).
 */
export function MovementsBrowser({ accountId, autoFocus = false, screen = 'mov', table = false, limit }: { accountId?: string; autoFocus?: boolean; screen?: string; table?: boolean; limit?: number }) {
  const { categories, accounts, tags, cur, fx, toast, bump, space } = useApp();
  const [aiBusy, setAiBusy] = useState(false);
  const [pk, setPk] = usePeriod(screen);
  const period = periodRange(pk, space?.week_start ?? 5);
  const { txs: all, loading } = useTxs(period);
  const [f, setF] = useState<Filters>(() => ({ ...EMPTY, review: new URLSearchParams(location.hash.split('?')[1] || '').get('f') === 'review' }));
  const [q, setQ] = useState('');
  const [sheet, setSheet] = useState(false);
  const [shown, setShown] = useState(limit || 150);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) search.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const txs = useMemo(() => (accountId ? all.filter((t) => t.account_id === accountId || t.to_account_id === accountId) : all), [all, accountId]);

  const apply = (list: typeof txs, x: Filters) => {
    const needle = q.trim().toLowerCase();
    const fam = x.cat && x.cat !== 'none' ? familyIds(categories, x.cat) : null;
    return list.filter((t) => {
      if (x.review && t.status !== 'review') return false;
      if (x.rec && !t.recurring_id) return false;
      if (x.kind === 'gastos' && t.kind !== 'expense' && t.kind !== 'refund') return false;
      if (x.kind === 'ingresos' && t.kind !== 'income' && t.kind !== 'contribution') return false;
      if (x.tag && !tagsOf(t).includes(x.tag)) return false;
      if (x.cat === 'none' && t.category_id) return false;
      if (fam && (!t.category_id || !fam.has(t.category_id))) return false;
      if (!accountId && x.acc === 'none' && t.account_id) return false;
      if (!accountId && x.acc && x.acc !== 'none' && t.account_id !== x.acc && t.to_account_id !== x.acc) return false;
      if (needle) {
        const c = catLabel(categories, categories.find((y) => y.id === t.category_id));
        const hay = [t.merchant, t.raw_merchant, t.note, c, ...tagsOf(t), String(t.amount)].join(' ').toLowerCase();
        if (!hay.includes(needle.replace(/[.,]/g, '')) && !hay.includes(needle)) return false;
      }
      return true;
    });
  };
  const filtered = useMemo(() => apply(txs, f), [txs, f, q, categories, accountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = groupByDay(filtered);
  const review = txs.filter((t) => t.status === 'review');
  const withSuggestion = review.filter((t) => t.suggested_category_id);
  const unchecked = review.filter((t) => !t.ai_checked_at && (t.kind === 'expense' || t.kind === 'income' || t.kind === 'refund'));

  async function askAi() {
    setAiBusy(true);
    try {
      const r = await db.fn<{ ok: boolean; processed?: number; reason?: string; results?: { applied: boolean }[] }>('categorize', { tx_ids: unchecked.map((t) => t.id) });
      if (!r.ok) toast(r.reason === 'quota' ? 'Llegaste al límite de consultas a la IA por hoy' : r.reason?.includes('API_KEY') ? 'Falta configurar la clave de Claude' : 'No se pudo consultar la IA');
      else {
        const applied = (r.results || []).filter((x) => x.applied).length;
        toast(`✨ ${applied} categorizados · ${(r.processed || 0) - applied} con sugerencia`);
      }
      bump();
    } catch {
      toast('No se pudo consultar la IA');
    } finally {
      setAiBusy(false);
    }
  }
  async function acceptAll() {
    setAiBusy(true);
    await Promise.all(
      withSuggestion.map((t) => db.update('transactions', { id: t.id }, { category_id: t.suggested_category_id, status: 'posted', category_source: 'ai', suggested_category_id: null })),
    );
    toast(`✅ ${withSuggestion.length} sugerencias aceptadas`);
    setAiBusy(false);
    bump();
  }

  // active filters as chips; the period chip is always there and opens the sheet
  const cat = categories.find((c) => c.id === f.cat);
  const acc = accounts.find((a) => a.id === f.acc);
  const active: [string, string, () => void][] = [];
  if (f.kind !== 'todos') active.push(['kind', f.kind === 'gastos' ? 'Gastos' : 'Ingresos', () => setF({ ...f, kind: 'todos' })]);
  if (f.review) active.push(['review', 'Por revisar', () => setF({ ...f, review: false })]);
  if (f.rec) active.push(['rec', 'Recurrentes', () => setF({ ...f, rec: false })]);
  if (f.cat) active.push(['cat', f.cat === 'none' ? 'Sin categoría' : `${cat?.emoji || ''} ${cat?.name || ''}`.trim(), () => setF({ ...f, cat: '' })]);
  if (!accountId && f.acc) active.push(['acc', f.acc === 'none' ? 'Efectivo / SINPE' : acc ? `${acc.name}${acc.last4 ? ` ••${acc.last4}` : ''}` : 'Cuenta', () => setF({ ...f, acc: '' })]);
  if (f.tag) active.push(['tag', f.tag, () => setF({ ...f, tag: '' })]);
  const count = active.length + (pk !== 'month' ? 1 : 0);

  const inflow = f.kind === 'ingresos';
  const total = inflow ? sumKind(filtered, 'income') + sumKind(filtered, 'contribution') : sumSpend(filtered);
  const empty = review.length === 0 && f.review ? '🎉 Nada por revisar.' : 'Nada con estos filtros.';

  return (
    <div className={table ? 'mb mb-table' : 'mb'}>
      <div className="mb-top">
        <label className="search">
          <Icon name="search" />
          <span className="sr">Buscar movimientos</span>
          <input ref={search} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" />
        </label>
        <button className={count ? 'mb-filter-btn on' : 'mb-filter-btn'} onClick={() => setSheet(true)} aria-label={count ? `Filtros, ${count} activos` : 'Filtros'}>
          <Icon name="sliders" size={18} />
          {count > 0 && <span className="mb-badge">{count}</span>}
        </button>
      </div>

      <div className="mb-chips" aria-label="Filtros activos">
        <button className="mb-chip period" onClick={() => setSheet(true)}>
          {period.label}
          <Icon name="chevDown" size={14} stroke={2.4} />
        </button>
        {active.map(([k, label, clear]) => (
          <button key={k} className="mb-chip on" onClick={clear} aria-label={`Quitar ${label}`}>
            {label}
            <Icon name="close" size={13} stroke={2.6} />
          </button>
        ))}
        {!f.review && review.length > 0 && (
          <button className="mb-chip hint" onClick={() => setF({ ...f, review: true })}>
            {review.length} por revisar
          </button>
        )}
      </div>

      {f.review && (withSuggestion.length > 0 || unchecked.length > 0) && (
        <div className="ai-bar">
          <span className="ai-bar-text">
            <strong>✨ Categorías con IA</strong>
            <span>{withSuggestion.length > 0 ? `${withSuggestion.length} con sugerencia lista` : `${unchecked.length} sin analizar`}</span>
          </span>
          {withSuggestion.length > 0 ? (
            <button className="btn-dark sm" disabled={aiBusy} onClick={acceptAll}>Aceptar todas</button>
          ) : (
            <button className="btn-dark sm" disabled={aiBusy} onClick={askAi}>{aiBusy ? 'Pensando…' : 'Sugerir'}</button>
          )}
        </div>
      )}

      {filtered.length > 0 && (
        <p className="mb-sum" aria-live="polite">
          {filtered.length === 1 ? '1 movimiento' : `${filtered.length} movimientos`}
          {total > 0 && <> · <strong>{money(total, cur, fx)}</strong> {inflow ? 'en ingresos' : 'en gastos'}</>}
        </p>
      )}

      {loading && all.length === 0 ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <div className="mb-empty">
          <span>{empty}</span>
          {(count > 0 || q) && (
            <button className="link-btn" onClick={() => { setF(EMPTY); setPk('month'); setQ(''); }}>Quitar filtros</button>
          )}
        </div>
      ) : table ? (
        <div className="ttable" role="table" aria-label="Movimientos">
          <div className={accountId ? 'ttr thead no-acc' : 'ttr thead'} role="row">
            <span role="columnheader">Fecha</span>
            <span role="columnheader">Comercio</span>
            <span role="columnheader">Categoría</span>
            {!accountId && <span role="columnheader">Cuenta</span>}
            <span role="columnheader" className="tt-amt">Monto</span>
          </div>
          {filtered.slice(0, shown).map((t) => <TxTableRow key={t.id} t={t} hideAccount={!!accountId} />)}
          {filtered.length > shown && (
            <button className="tt-more" onClick={() => setShown((n) => n + 150)}>Mostrar más</button>
          )}
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.label} className="mb-day">
            <div className="mb-day-head">{g.label}</div>
            {g.rows.map((t) => <TxRow key={t.id} t={t} />)}
          </section>
        ))
      )}

      {sheet && (
        <FilterSheet
          value={f}
          period={pk}
          accountId={accountId}
          count={(x) => apply(txs, x).length}
          reviewCount={review.length}
          onClose={() => setSheet(false)}
          onApply={(x, p) => {
            setF(x);
            if (p !== pk) setPk(p);
            setSheet(false);
          }}
          categories={pickerOrder(categories.filter((c) => !c.archived))}
          accounts={accounts.filter((a) => !a.archived).sort(byKind)}
          tags={tags.map((t) => t.name)}
          weekStart={space?.week_start ?? 5}
        />
      )}
    </div>
  );
}

/** All the filters in one sheet; nothing applies until "Ver resultados". */
function FilterSheet({ value, period, accountId, count, reviewCount, onClose, onApply, categories, accounts, tags, weekStart }: {
  value: Filters; period: PeriodKey; accountId?: string; count: (f: Filters) => number; reviewCount: number;
  onClose: () => void; onApply: (f: Filters, p: PeriodKey) => void;
  categories: ReturnType<typeof pickerOrder>; accounts: { id: string; name: string; last4: string | null }[]; tags: string[]; weekStart: number;
}) {
  const [x, setX] = useState<Filters>(value);
  const [p, setP] = useState<PeriodKey>(period);
  const parts = customParts(p);
  const [custom, setCustom] = useState(!!parts);
  const [from, setFrom] = useState(parts?.[0] || todayStr().slice(0, 8) + '01');
  const [to, setTo] = useState(parts?.[1] || todayStr());
  const set = (patch: Partial<Filters>) => setX({ ...x, ...patch });
  // the count reflects the period only after applying (it needs new data); filters are live
  const n = count(x);
  const samePeriod = p === period;

  return (
    <Sheet title="Filtros" onClose={onClose}>
      <div className="fs">
        <section className="fs-sec">
          <h3 className="fs-h">Período</h3>
          <div className="fs-chips">
            {PRESETS.filter(([k]) => ['month', 'lastmonth', 'week', '30d', '90d', 'year'].includes(k)).map(([k, label]) => (
              <button key={k} className={p === k && !custom ? 'fs-chip on' : 'fs-chip'} aria-pressed={p === k && !custom} onClick={() => { setP(k); setCustom(false); }}>{label}</button>
            ))}
            <button className={custom ? 'fs-chip on' : 'fs-chip'} aria-pressed={custom} onClick={() => setCustom(true)}>Fechas…</button>
          </div>
          {custom ? (
            <div className="grid2">
              <label className="col gap6"><span className="hint">Desde</span><input className="input" type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setP(customKey(e.target.value, to)); }} /></label>
              <label className="col gap6"><span className="hint">Hasta</span><input className="input" type="date" value={to} min={from} onChange={(e) => { setTo(e.target.value); setP(customKey(from, e.target.value)); }} /></label>
            </div>
          ) : (
            <label className="fs-select">
              <span className="sr">Mes</span>
              <select value={p.startsWith('m:') ? p : ''} onChange={(e) => e.target.value && setP(e.target.value)}>
                <option value="">Otro mes…</option>
                {recentMonths().slice(2).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
              <Icon name="chevDown" size={14} stroke={2.4} />
            </label>
          )}
        </section>

        <section className="fs-sec">
          <h3 className="fs-h">Tipo</h3>
          <Segmented value={x.kind} options={[['todos', 'Todos'], ['gastos', 'Gastos'], ['ingresos', 'Ingresos']]} onChange={(v) => set({ kind: v })} dark={false} />
          <div className="fs-toggles">
            <label className="fs-toggle">
              <span>Por revisar{reviewCount ? <span className="muted"> · {reviewCount}</span> : null}</span>
              <input type="checkbox" checked={x.review} onChange={(e) => set({ review: e.target.checked })} />
            </label>
            <label className="fs-toggle">
              <span>Solo recurrentes</span>
              <input type="checkbox" checked={x.rec} onChange={(e) => set({ rec: e.target.checked })} />
            </label>
          </div>
        </section>

        <section className="fs-sec">
          <h3 className="fs-h">Categoría</h3>
          <div className="fs-chips">
            <button className={!x.cat ? 'fs-chip on' : 'fs-chip'} onClick={() => set({ cat: '' })}>Todas</button>
            {categories.filter((c) => !c.parent_id).map((c) => (
              <button key={c.id} className={x.cat === c.id ? 'fs-chip on' : 'fs-chip'} aria-pressed={x.cat === c.id} onClick={() => set({ cat: x.cat === c.id ? '' : c.id })}>{c.emoji} {c.name}</button>
            ))}
            <button className={x.cat === 'none' ? 'fs-chip on' : 'fs-chip'} onClick={() => set({ cat: x.cat === 'none' ? '' : 'none' })}>Sin categoría</button>
          </div>
          {(() => {
            const parent = x.cat && x.cat !== 'none' ? categories.find((c) => c.id === x.cat)?.parent_id || x.cat : '';
            const subs = parent ? categories.filter((c) => c.parent_id === parent) : [];
            return subs.length > 0 ? (
              <div className="fs-chips sub">
                {subs.map((c) => (
                  <button key={c.id} className={x.cat === c.id ? 'fs-chip on' : 'fs-chip'} onClick={() => set({ cat: x.cat === c.id ? parent : c.id })}>{c.emoji} {c.name}</button>
                ))}
              </div>
            ) : null;
          })()}
        </section>

        {!accountId && accounts.length > 0 && (
          <section className="fs-sec">
            <h3 className="fs-h">Cuenta</h3>
            <div className="fs-chips">
              <button className={!x.acc ? 'fs-chip on' : 'fs-chip'} onClick={() => set({ acc: '' })}>Todas</button>
              {accounts.map((a) => (
                <button key={a.id} className={x.acc === a.id ? 'fs-chip on' : 'fs-chip'} onClick={() => set({ acc: x.acc === a.id ? '' : a.id })}>{a.name}{a.last4 ? ` ••${a.last4}` : ''}</button>
              ))}
              <button className={x.acc === 'none' ? 'fs-chip on' : 'fs-chip'} onClick={() => set({ acc: x.acc === 'none' ? '' : 'none' })}>Efectivo / SINPE</button>
            </div>
          </section>
        )}

        {tags.length > 0 && (
          <section className="fs-sec">
            <h3 className="fs-h">Etiqueta</h3>
            <div className="fs-chips">
              {tags.map((t) => (
                <button key={t} className={x.tag === t ? 'fs-chip on' : 'fs-chip'} onClick={() => set({ tag: x.tag === t ? '' : t })}>{t}</button>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="fs-foot">
        <button className="link-btn" onClick={() => { setX(EMPTY); setP('month'); setCustom(false); }}>Limpiar</button>
        <button className="btn-dark grow" disabled={custom && (!from || !to || from > to)} onClick={() => onApply(x, p)}>
          {samePeriod ? (n === 1 ? 'Ver 1 movimiento' : `Ver ${n} movimientos`) : 'Ver resultados'}
        </button>
      </div>
    </Sheet>
  );
}

export { spend };
