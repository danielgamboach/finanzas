import { useMemo, useState } from 'react';
import { monthRange, spend, sumKind, sumSpend, tagsOf } from '../lib/calc';
import { money, monthName } from '../lib/format';
import { useApp, useTxs } from '../store';
import { BigMoney, Icon, Loading, Nav, TopBar } from '../ui';
import { TxRow } from '../ui/TxRow';
import { groupByDay, MonthNav, useMonth } from './Home';

type Filter = 'todos' | 'review' | 'rec' | 'gastos' | 'ingresos' | string;

export function Movimientos() {
  const { categories, tags, cur, fx } = useApp();
  const [ym, setYm] = useMonth();
  const month = monthRange(ym[0], ym[1]);
  const { txs, loading } = useTxs(month);
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
        const cat = categories.find((c) => c.id === t.category_id)?.name || '';
        const hay = [t.merchant, t.raw_merchant, t.note, cat, ...tagsOf(t), String(t.amount)].join(' ').toLowerCase();
        if (!hay.includes(needle.replace(/[.,]/g, '')) && !hay.includes(needle)) return false;
      }
      return true;
    });
  }, [txs, filter, q, categories]);

  const groups = groupByDay(filtered);
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

      <section className="hero small" aria-label="Total">
        <MonthNav ym={ym} setYm={setYm} />
        <span className="muted-label">{showInflow ? 'Ingresos y aportes' : 'Gastos'} de {monthName(ym[1])}</span>
        <BigMoney crc={showInflow ? inflow : spent} size={48} />
        <span className="muted-label">{filtered.length === 1 ? '1 movimiento' : `${filtered.length} movimientos`}</span>
      </section>

      {loading && txs.length === 0 ? (
        <Loading />
      ) : groups.length === 0 ? (
        <div className="card empty center">
          <span className="big-emoji">{filter === 'review' ? '🎉' : '🗂️'}</span>
          <strong>{filter === 'review' ? 'Nada por revisar' : 'Sin movimientos'}</strong>
          <span>{filter === 'review' ? 'Todos los movimientos tienen categoría.' : 'Probá con otro filtro o mes.'}</span>
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
      <Nav active="mov" />
    </div>
  );
}

export { spend };
