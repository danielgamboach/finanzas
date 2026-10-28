import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Chip, EmptyState, SearchField } from '../ds';
import { db } from '../lib/api';
import { spend, sumKind, sumSpend, tagsOf } from '../lib/calc';
import { customKey, customParts, periodRange, PRESETS, recentMonths, usePeriod, type PeriodKey } from '../lib/period';
import { amount, unitOf } from '../lib/format';
import { catLabel, familyIds, pickerOrder } from '../lib/cats';
import { byKind } from '../lib/accounts';
import { useApp, useTxs } from '../store';
import { Icon, Loading, Segmented, Sheet } from '../ui';
import { restoreCategories, snapCategories } from '../lib/undo';
import { canCategorize, TxRow, TxTableRow } from '../ui/TxRow';
import { useLongPress } from '../lib/longPress';
import { groupByDay } from './Home';

type Kind = 'todos' | 'gastos' | 'ingresos';
interface Filters { kind: Kind; review: boolean; rec: boolean; cat: string; acc: string; tag: string }
const EMPTY: Filters = { kind: 'todos', review: false, rec: false, cat: '', acc: '', tag: '' };
/** Rows the closed home sheet shows (the rest fade out under the summary). */
const SHEET_ROWS = 14;
const todayStr = () => new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10);

/**
 * Every movement of the space: a search field, one "Filtros" button and the active filters as
 * removable chips. All the options live in the filter sheet (period, type, category, account, tag).
 * Lives inside the home sheet (white) and inside an account's view (dark, with `accountId` fixed).
 */
export function MovementsBrowser({ accountId, autoFocus = false, screen = 'mov', table = false, limit, sheet: home }: {
  accountId?: string; autoFocus?: boolean; screen?: string; table?: boolean; limit?: number;
  /** Inside the home sheet: the same rows, grouped by day, open or closed; the search and
   *  filters fold in above them when it opens, and `focus` changing puts the cursor in the search. */
  sheet?: { open: boolean; focus: number };
}) {
  const { categories, accounts, tags, cur, fx, toast, bump, space } = useApp();
  const [aiBusy, setAiBusy] = useState(false);
  const [pk, setPk] = usePeriod(screen);
  const period = periodRange(pk, space?.week_start ?? 5);
  const { txs: all, loading } = useTxs(period);
  const [f, setF] = useState<Filters>(() => ({ ...EMPTY, review: new URLSearchParams(location.hash.split('?')[1] || '').get('f') === 'review' }));
  const [q, setQ] = useState('');
  const [sheet, setSheet] = useState(false);
  const [shown, setShown] = useState(limit || 150);
  // selecting several movements to change their category at once (null = not selecting)
  const [sel, setSel] = useState<Set<string> | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  useEffect(() => {
    if (!sel) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setSel(null);
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [sel]);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) search.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  // the home sheet: focus the search when asked; closing it leaves everything as it was at the start
  const sheetOpen = home?.open ?? true;
  useEffect(() => {
    if (home?.open && home.focus > 0) search.current?.focus({ preventScroll: true });
  }, [home?.open, home?.focus]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!home || home.open) return;
    setQ('');
    setF(EMPTY);
    setSel(null);
    setShown(limit || 150);
    search.current?.blur();
  }, [home?.open]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const selectable = filtered.filter(canCategorize);
  const toggle = (id: string) => setSel((cur) => {
    const n = new Set(cur || []);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  // holding a row starts selecting, with that row already picked (the handlers stay on while selecting,
  // so the click that ends the hold is swallowed instead of unpicking it)
  const press = useLongPress((id: string) => setSel((cur) => (cur ? cur : new Set([id]))));
  const pickOf = (t: (typeof filtered)[number]) => (sel && canCategorize(t) ? { selected: sel.has(t.id), onToggle: () => toggle(t.id) } : undefined);
  const dim = (t: (typeof filtered)[number]) => !!sel && !canCategorize(t);

  async function bulkSet(catId: string) {
    if (!sel || !sel.size || !catId) return;
    const ids = [...sel];
    const c = categories.find((x) => x.id === catId);
    const before = snapCategories(txs.filter((t) => sel.has(t.id)));
    setBulkBusy(true);
    try {
      await db.updateIds('transactions', ids, { category_id: catId, status: 'posted', category_source: 'manual', suggested_category_id: null });
      toast(`${c?.emoji || '✅'} ${ids.length === 1 ? '1 movimiento' : `${ids.length} movimientos`} → ${c?.name || 'categoría'}`, () => restoreCategories(before));
      setSel(null);
      bump();
    } catch {
      toast('No se pudo cambiar la categoría');
    } finally {
      setBulkBusy(false);
    }
  }
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
    const before = snapCategories(withSuggestion);
    try {
      // one request per suggested category instead of one per movement
      const byCat = new Map<string, string[]>();
      withSuggestion.forEach((t) => byCat.set(t.suggested_category_id!, [...(byCat.get(t.suggested_category_id!) || []), t.id]));
      for (const [cat, ids] of byCat) await db.updateIds('transactions', ids, { category_id: cat, status: 'posted', category_source: 'ai', suggested_category_id: null });
      toast(`✅ ${withSuggestion.length} sugerencias aceptadas`, () => restoreCategories(before));
    } catch {
      toast('No se pudieron aceptar todas');
    }
    setAiBusy(false);
    bump();
  }

  // quick chips (este mes, mes pasado, categorías) and the active filters as removable chips
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
      <div className={home ? `mb-reveal${sheetOpen ? ' is-open' : ''}` : 'mb-controls'} aria-hidden={home && !sheetOpen ? true : undefined} inert={home && !sheetOpen ? true : undefined}>
      <div className="mb-reveal-inner">
      <div className="mb-top">
        <SearchField ref={search} wrapClassName="mb-search" size="md" placeholder="Buscar movimientos" value={q} onChange={setQ} aria-label="Buscar movimientos" />
        <Button variant={count ? 'primary' : 'secondary'} size="md" iconOnly className="mb-filter-btn" onClick={() => setSheet(true)} aria-label={count ? `Filtros, ${count} activos` : 'Filtros'}>
          <Icon name="sliders" size={18} />
          {count > 0 && <Badge className="mb-badge" count={count} />}
        </Button>
      </div>

      <div className="mb-chips" aria-label="Filtros">
        {pk !== 'month' && pk !== 'lastmonth' && <Chip size="sm" selected trailing="chevron" onClick={() => setSheet(true)}>{period.label}</Chip>}
        <Chip size="sm" selected={pk === 'month'} onClick={() => setPk('month')}>Este mes</Chip>
        <Chip size="sm" selected={pk === 'lastmonth'} onClick={() => setPk(pk === 'lastmonth' ? 'month' : 'lastmonth')}>Mes pasado</Chip>
        {!f.cat && <Chip size="sm" trailing="chevron" onClick={() => setSheet(true)}>Categorías</Chip>}
        {active.map(([k, label, clear]) => (
          <Chip key={k} size="sm" selected trailing="remove" onRemove={clear} aria-label={`Quitar ${label}`}>{label}</Chip>
        ))}
        {!f.review && review.length > 0 && (
          <Chip size="sm" className="mb-chip-hint" onClick={() => setF({ ...f, review: true })}>{review.length} por revisar</Chip>
        )}
      </div>

      {f.review && (withSuggestion.length > 0 || unchecked.length > 0) && (
        <div className="ai-bar">
          <span className="ai-bar-text">
            <strong>✨ Categorías con IA</strong>
            <span>{withSuggestion.length > 0 ? `${withSuggestion.length} con sugerencia lista` : `${unchecked.length} sin analizar`}</span>
          </span>
          {withSuggestion.length > 0 ? (
            <Button variant="primary" size="md" disabled={aiBusy} onClick={acceptAll}>Aceptar todas</Button>
          ) : (
            <Button variant="primary" size="md" disabled={aiBusy} onClick={askAi}>{aiBusy ? 'Pensando…' : 'Sugerir'}</Button>
          )}
        </div>
      )}
      </div>
      </div>

      {loading && all.length === 0 ? (
        <Loading />
      ) : filtered.length === 0 && home && !sheetOpen ? (
        <EmptyState icon="🧾" title="Todavía no hay movimientos este mes">Tocá + arriba para agregar uno.</EmptyState>
      ) : filtered.length === 0 ? (
        <div className="mb-empty">
          <span>{empty}</span>
          {(count > 0 || q) && (
            <Button variant="link" onClick={() => { setF(EMPTY); setPk('month'); setQ(''); }}>Quitar filtros</Button>
          )}
        </div>
      ) : home ? (
        <div className="mb-flat">
          {groupByDay(filtered.slice(0, sheetOpen ? shown : SHEET_ROWS)).map((g) => (
            <section key={g.label} className="mb-day">
              <div className="mb-day-head">{g.label}</div>
              {g.rows.map((t) => (dim(t) ? (
                <div key={t.id} className="sel-dim"><TxRow t={t} size="sheet" /></div>
              ) : (
                <div key={t.id} className="mb-hold" {...(sheetOpen && canCategorize(t) ? press(t.id) : {})}><TxRow t={t} size="sheet" pick={pickOf(t)} /></div>
              )))}
            </section>
          ))}
          {sheetOpen && filtered.length > shown && (
            <Button variant="secondary" size="sm" onClick={() => setShown((n) => n + 150)}>Mostrar más</Button>
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
          {filtered.slice(0, shown).map((t) => (
            <div key={t.id} className={dim(t) ? 'sel-dim' : 'mb-hold'} {...(canCategorize(t) ? press(t.id) : {})}>
              <TxTableRow t={t} hideAccount={!!accountId} pick={pickOf(t)} />
            </div>
          ))}
          {filtered.length > shown && (
            <Button variant="secondary" size="sm" onClick={() => setShown((n) => n + 150)}>Mostrar más</Button>
          )}
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.label} className="mb-day">
            <div className="mb-day-head">{g.label}</div>
            {g.rows.map((t) => (dim(t) ? (
              <div key={t.id} className="sel-dim"><TxRow t={t} /></div>
            ) : (
              <div key={t.id} className="mb-hold" {...(canCategorize(t) ? press(t.id) : {})}><TxRow t={t} pick={pickOf(t)} /></div>
            )))}
          </section>
        ))
      )}

      {sel && (
        <BulkBar
          ids={sel}
          all={selectable.map((t) => t.id)}
          kinds={new Set(selectable.filter((t) => sel.has(t.id)).map((t) => (t.kind === 'income' ? 'income' : 'expense')))}
          busy={bulkBusy}
          onAll={(on) => setSel(new Set(on ? selectable.map((t) => t.id) : []))}
          onPick={bulkSet}
          onClose={() => setSel(null)}
        />
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
              <Chip key={k} selected={p === k && !custom} onClick={() => { setP(k); setCustom(false); }}>{label}</Chip>
            ))}
            <Chip selected={custom} onClick={() => setCustom(true)}>Fechas…</Chip>
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
            <Chip selected={!x.cat} onClick={() => set({ cat: '' })}>Todas</Chip>
            {categories.filter((c) => !c.parent_id).map((c) => (
              <Chip key={c.id} selected={x.cat === c.id} onClick={() => set({ cat: x.cat === c.id ? '' : c.id })}>{c.emoji} {c.name}</Chip>
            ))}
            <Chip selected={x.cat === 'none'} onClick={() => set({ cat: x.cat === 'none' ? '' : 'none' })}>Sin categoría</Chip>
          </div>
          {(() => {
            const parent = x.cat && x.cat !== 'none' ? categories.find((c) => c.id === x.cat)?.parent_id || x.cat : '';
            const subs = parent ? categories.filter((c) => c.parent_id === parent) : [];
            return subs.length > 0 ? (
              <div className="fs-chips sub">
                {subs.map((c) => (
                  <Chip key={c.id} selected={x.cat === c.id} onClick={() => set({ cat: x.cat === c.id ? parent : c.id })}>{c.emoji} {c.name}</Chip>
                ))}
              </div>
            ) : null;
          })()}
        </section>

        {!accountId && accounts.length > 0 && (
          <section className="fs-sec">
            <h3 className="fs-h">Cuenta</h3>
            <div className="fs-chips">
              <Chip selected={!x.acc} onClick={() => set({ acc: '' })}>Todas</Chip>
              {accounts.map((a) => (
                <Chip key={a.id} selected={x.acc === a.id} onClick={() => set({ acc: x.acc === a.id ? '' : a.id })}>{a.name}{a.last4 ? ` ••${a.last4}` : ''}</Chip>
              ))}
              <Chip selected={x.acc === 'none'} onClick={() => set({ acc: x.acc === 'none' ? '' : 'none' })}>Efectivo / SINPE</Chip>
            </div>
          </section>
        )}

        {tags.length > 0 && (
          <section className="fs-sec">
            <h3 className="fs-h">Etiqueta</h3>
            <div className="fs-chips">
              {tags.map((t) => (
                <Chip key={t} selected={x.tag === t} onClick={() => set({ tag: x.tag === t ? '' : t })}>{t}</Chip>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="fs-foot">
        <Button variant="link" onClick={() => { setX(EMPTY); setP('month'); setCustom(false); }}>Limpiar</Button>
        <Button variant="primary" size="lg" className="grow" disabled={custom && (!from || !to || from > to)} onClick={() => onApply(x, p)}>
          {samePeriod ? (n === 1 ? 'Ver 1 movimiento' : `Ver ${n} movimientos`) : 'Ver resultados'}
        </Button>
      </div>
    </Sheet>
  );
}

export { spend };

/** Floating bar while selecting (started by holding a row): how many, select all, the category to give them, and a round X beside it to stop. */
function BulkBar({ ids, all, kinds, busy, onAll, onPick, onClose }: { ids: Set<string>; all: string[]; kinds: Set<string>; busy: boolean; onAll: (on: boolean) => void; onPick: (id: string) => void; onClose: () => void }) {
  const { categories } = useApp();
  const n = ids.size;
  const allOn = n > 0 && n === all.length;
  const group = (kind: 'expense' | 'income') => pickerOrder(categories.filter((c) => !c.archived && c.kind === kind));
  const opt = (c: ReturnType<typeof group>[number]) => <option key={c.id} value={c.id}>{c.parent_id ? '    ' : ''}{c.emoji} {c.name}</option>;
  const showIncome = kinds.has('income');
  const showExpense = kinds.has('expense') || kinds.size === 0;
  return (
    <div className="mb-bulk-wrap">
    <div className="mb-bulk" role="toolbar" aria-label="Cambiar categoría a varios">
      <span className="mb-bulk-n" aria-live="polite">{n === 0 ? 'Elegí movimientos' : `${n} de ${all.length}`}</span>
      <button className="mb-bulk-all" onClick={() => onAll(!allOn)}>{allOn ? 'Ninguno' : 'Todos'}</button>
      <label className={n && !busy ? 'mb-bulk-cat' : 'mb-bulk-cat off'}>
        <span>{busy ? 'Guardando…' : 'Categoría'}</span>
        <Icon name="chevDown" size={14} stroke={2.4} />
        <select value="" disabled={!n || busy} onChange={(e) => onPick(e.target.value)} aria-label="Categoría para los seleccionados">
          <option value="" disabled>Elegir categoría</option>
          {showExpense && showIncome ? (
            <>
              <optgroup label="Gastos">{group('expense').map(opt)}</optgroup>
              <optgroup label="Ingresos">{group('income').map(opt)}</optgroup>
            </>
          ) : (
            group(showIncome ? 'income' : 'expense').map(opt)
          )}
        </select>
      </label>
    </div>
    <Button variant="secondary" size="lg" iconOnly className="mb-bulk-x" onClick={onClose} aria-label="Dejar de seleccionar"><Icon name="close" size={18} /></Button>
    </div>
  );
}
