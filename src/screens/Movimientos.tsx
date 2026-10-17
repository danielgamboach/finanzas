import { useMemo, useState } from 'react';
import { db } from '../lib/api';
import { spend, sumKind, sumSpend, tagsOf } from '../lib/calc';
import { periodRange, usePeriod } from '../lib/period';
import { money } from '../lib/format';
import { catLabel } from '../lib/cats';
import { useApp, useTxs } from '../store';
import { BigMoney, Icon, Loading, Nav, TopBar } from '../ui';
import { TxRow } from '../ui/TxRow';
import { groupByDay } from './Home';
import { PeriodPicker } from '../ui/PeriodPicker';

type Filter = 'todos' | 'review' | 'rec' | 'gastos' | 'ingresos' | string;

export function Movimientos() {
  const { categories, tags, cur, fx, toast, bump, space } = useApp();
  const [aiBusy, setAiBusy] = useState(false);
  const [pk, setPk] = usePeriod('mov');
  const period = periodRange(pk, space?.week_start ?? 5);
  const { txs, loading } = useTxs(period);
  const [filter, setFilter] = useState<Filter>(() => new URLSearchParams(location.hash.split('?')[1] || '').get('f') || 'todos');
  const [q, setQ] = useState('');

  const reviewCount = txs.filter((t) => t.status === 'review').length;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return txs.filter((t) => {
      if (filter === 'review' && t.status !== 'review') return false;
      if (filter === 'rec' && !t.recurring_id) return false;
      if (filter === 'gastos' && t.kind !== 'expense' && t.kind !== 'refund') return false;
      if (filter === 'ingresos' && t.kind !== 'income' && t.kind !== 'contribution') return false;
      if (filter.startsWith('#') && !tagsOf(t).includes(filter)) return false;
      if (needle) {
        const cat = catLabel(categories, categories.find((c) => c.id === t.category_id));
        const hay = [t.merchant, t.raw_merchant, t.note, cat, ...tagsOf(t), String(t.amount)].join(' ').toLowerCase();
        if (!hay.includes(needle.replace(/[.,]/g, '')) && !hay.includes(needle)) return false;
      }
      return true;
    });
  }, [txs, filter, q, categories]);

  const groups = groupByDay(filtered);
  const review = txs.filter((t) => t.status === 'review');
  const withSuggestion = review.filter((t) => t.suggested_category_id);
  const unchecked = review.filter((t) => !t.ai_checked_at && (t.kind === 'expense' || t.kind === 'income' || t.kind === 'refund'));

  async function askAi() {
    setAiBusy(true);
    try {
      const r = await db.fn<{ ok: boolean; processed?: number; reason?: string; results?: { applied: boolean }[] }>('categorize', { tx_ids: unchecked.map((t) => t.id) });
      if (!r.ok) toast(r.reason?.includes('API_KEY') ? 'Falta configurar la clave de Claude' : 'No se pudo consultar la IA');
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
  const showInflow = filter === 'ingresos';

  const chips: [Filter, string][] = [
    ['todos', 'Todos'],
    ['review', `❓ Por revisar${reviewCount ? ` ${reviewCount}` : ''}`],
    ['rec', '🔁 Recurrentes'],
    ['gastos', '💸 Gastos'],
    ['ingresos', '💰 Ingresos'],
    ...tags.map((t) => [t.name, t.name] as [Filter, string]),
  ];

  return (
    <div className="screen">
      <TopBar />
      <h1 className="h1">Movimientos</h1>

      <label className="search">
        <Icon name="search" />
        <span className="sr">Buscar movimientos</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar comercio, monto o #tag" />
      </label>

      <div className="hscroll">
        {chips.map(([k, label]) => (
          <button key={k} className={filter === k ? 'filter on' : 'filter'} aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
      </div>

      {filter === 'review' && (withSuggestion.length > 0 || unchecked.length > 0) && (
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

      <section className="hero small" aria-label="Total">
        <PeriodPicker value={pk} onChange={setPk} weekStart={space?.week_start ?? 5} />
        <span className="muted-label">{showInflow ? 'Ingresos y aportes' : 'Gastos'} · {period.label}</span>
        <BigMoney crc={showInflow ? inflow : spent} size={48} />
        <span className="muted-label">{filtered.length === 1 ? '1 movimiento' : `${filtered.length} movimientos`}</span>
      </section>

      {loading && txs.length === 0 ? (
        <Loading />
      ) : groups.length === 0 ? (
        <div className="card empty center">
          <span className="big-emoji">{filter === 'review' ? '🎉' : '🗂️'}</span>
          <strong>{filter === 'review' ? 'Nada por revisar' : 'Sin movimientos'}</strong>
          <span>{filter === 'review' ? 'Todos los movimientos tienen categoría.' : 'Probá con otro filtro o período.'}</span>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.label} className="col gap8">
            <div className="row between">
              <span className="date-pill">{g.label}</span>
              {g.total !== 0 && <span className="date-pill">{money(g.total, cur, fx)}</span>}
            </div>
            <div className="card list">
              {g.rows.map((t) => (
                <TxRow key={t.id} t={t} />
              ))}
            </div>
          </section>
        ))
      )}
      <Nav active={null} />
    </div>
  );
}

export { spend };
