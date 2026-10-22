import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../lib/api';
import { spend, sumKind, sumSpend, tagsOf } from '../lib/calc';
import { periodRange, usePeriod } from '../lib/period';
import { money } from '../lib/format';
import { catLabel, familyIds, pickerOrder } from '../lib/cats';
import { byKind } from '../lib/accounts';
import { useApp, useTxs } from '../store';
import { Icon, Loading } from '../ui';
import { TxRow, TxTableRow } from '../ui/TxRow';
import { groupByDay } from './Home';
import { PeriodPicker } from '../ui/PeriodPicker';

type Kind = 'todos' | 'review' | 'rec' | 'gastos' | 'ingresos' | string;

/**
 * Every movement of the space with search and filters (period, category, account, type).
 * Lives inside the home sheet (white) and inside an account's view (dark, with `accountId` fixed).
 */
export function MovementsBrowser({ accountId, autoFocus = false, screen = 'mov', table = false, limit }: { accountId?: string; autoFocus?: boolean; screen?: string; table?: boolean; limit?: number }) {
  const { categories, accounts, tags, cur, fx, toast, bump, space } = useApp();
  const [aiBusy, setAiBusy] = useState(false);
  const [pk, setPk] = usePeriod(screen);
  const period = periodRange(pk, space?.week_start ?? 5);
  const { txs: all, loading } = useTxs(period);
  const [kind, setKind] = useState<Kind>(() => new URLSearchParams(location.hash.split('?')[1] || '').get('f') || 'todos');
  const [cat, setCat] = useState('');
  const [acc, setAcc] = useState(accountId || '');
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(limit || 150);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) search.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const txs = useMemo(() => (accountId ? all.filter((t) => t.account_id === accountId || t.to_account_id === accountId) : all), [all, accountId]);
  const reviewCount = txs.filter((t) => t.status === 'review').length;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const fam = cat && cat !== 'none' ? familyIds(categories, cat) : null;
    return txs.filter((t) => {
      if (kind === 'review' && t.status !== 'review') return false;
      if (kind === 'rec' && !t.recurring_id) return false;
      if (kind === 'gastos' && t.kind !== 'expense' && t.kind !== 'refund') return false;
      if (kind === 'ingresos' && t.kind !== 'income' && t.kind !== 'contribution') return false;
      if (kind.startsWith('#') && !tagsOf(t).includes(kind)) return false;
      if (cat === 'none' && t.category_id) return false;
      if (fam && (!t.category_id || !fam.has(t.category_id))) return false;
      if (!accountId && acc === 'none' && t.account_id) return false;
      if (!accountId && acc && acc !== 'none' && t.account_id !== acc && t.to_account_id !== acc) return false;
      if (needle) {
        const c = catLabel(categories, categories.find((x) => x.id === t.category_id));
        const hay = [t.merchant, t.raw_merchant, t.note, c, ...tagsOf(t), String(t.amount)].join(' ').toLowerCase();
        if (!hay.includes(needle.replace(/[.,]/g, '')) && !hay.includes(needle)) return false;
      }
      return true;
    });
  }, [txs, kind, cat, acc, q, categories, accountId]);

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
      withSuggestion.map((t) =>
        db.update('transactions', { id: t.id }, { category_id: t.suggested_category_id, status: 'posted', category_source: 'ai', suggested_category_id: null }),
      ),
    );
    toast(`✅ ${withSuggestion.length} sugerencias aceptadas`);
    setAiBusy(false);
    bump();
  }

  const spent = sumSpend(filtered);
  const inflow = sumKind(filtered, 'income') + sumKind(filtered, 'contribution');
  const showInflow = kind === 'ingresos';
  const chips: [Kind, string][] = [
    ['todos', 'Todos'],
    ['review', `Por revisar${reviewCount ? ` · ${reviewCount}` : ''}`],
    ['gastos', 'Gastos'],
    ['ingresos', 'Ingresos'],
    ['rec', 'Recurrentes'],
    ...tags.map((t) => [t.name, t.name] as [Kind, string]),
  ];
  const cats = pickerOrder(categories.filter((c) => !c.archived));
  const accs = accounts.filter((a) => !a.archived).sort(byKind);
  const active = (kind !== 'todos' ? 1 : 0) + (cat ? 1 : 0) + (!accountId && acc ? 1 : 0) + (q ? 1 : 0);

  return (
    <div className={table ? 'mb mb-table' : 'mb'}>
      <label className="search">
        <Icon name="search" />
        <span className="sr">Buscar movimientos</span>
        <input ref={search} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar comercio, monto o #tag" />
      </label>

      <div className="mb-filters">
        <PeriodPicker value={pk} onChange={setPk} weekStart={space?.week_start ?? 5} />
        <label className={cat ? 'select-pill on' : 'select-pill'}>
          <span className="sr">Categoría</span>
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Todas las categorías</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.parent_id ? '   ↳ ' : ''}{c.emoji} {c.name}</option>
            ))}
            <option value="none">Sin categoría</option>
          </select>
          <Icon name="chevDown" size={14} stroke={2.4} />
        </label>
        {!accountId && (
          <label className={acc ? 'select-pill on' : 'select-pill'}>
            <span className="sr">Cuenta</span>
            <select value={acc} onChange={(e) => setAcc(e.target.value)}>
              <option value="">Todas las cuentas</option>
              {accs.map((a) => (
                <option key={a.id} value={a.id}>{a.name}{a.last4 ? ` ••${a.last4}` : ''}</option>
              ))}
              <option value="none">Efectivo / SINPE</option>
            </select>
            <Icon name="chevDown" size={14} stroke={2.4} />
          </label>
        )}
      </div>

      <div className="hscroll mb-chips">
        {chips.map(([k, label]) => (
          <button key={k} className={kind === k ? 'filter on' : 'filter'} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {label}
          </button>
        ))}
      </div>

      {kind === 'review' && (withSuggestion.length > 0 || unchecked.length > 0) && (
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

      <div className="mb-total" aria-live="polite">
        <span className="muted">{showInflow ? 'Ingresos' : 'Gastos'} · {period.label}{active ? ' · con filtros' : ''}</span>
        <strong>{money(showInflow ? inflow : spent, cur, fx)}</strong>
        <span className="muted">{filtered.length === 1 ? '1 movimiento' : `${filtered.length} movimientos`}</span>
      </div>

      {loading && all.length === 0 ? (
        <Loading />
      ) : table ? (
        filtered.length === 0 ? (
          <div className="empty center-text">{kind === 'review' ? '🎉 Nada por revisar.' : 'Sin movimientos con estos filtros.'}</div>
        ) : (
          <div className="ttable" role="table" aria-label="Movimientos">
            <div className={accountId ? 'ttr thead no-acc' : 'ttr thead'} role="row">
              <span role="columnheader">Fecha</span>
              <span role="columnheader">Comercio</span>
              <span role="columnheader">Categoría</span>
              {!accountId && <span role="columnheader">Cuenta</span>}
              <span role="columnheader" className="tt-amt">Monto</span>
            </div>
            {filtered.slice(0, shown).map((t) => (
              <TxTableRow key={t.id} t={t} hideAccount={!!accountId} />
            ))}
            {filtered.length > shown && (
              <button className="tt-more" onClick={() => setShown((n) => n + 150)}>Mostrar {Math.min(150, filtered.length - shown)} más · quedan {filtered.length - shown}</button>
            )}
          </div>
        )
      ) : groups.length === 0 ? (
        <div className="empty center-text">
          {kind === 'review' ? '🎉 Nada por revisar.' : 'Sin movimientos con estos filtros.'}
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.label} className="mb-day">
            <div className="row between mb-day-head">
              <span>{g.label}</span>
              {g.total !== 0 && <span>{money(g.total, cur, fx)}</span>}
            </div>
            {g.rows.map((t) => (
              <TxRow key={t.id} t={t} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}

export { spend };
