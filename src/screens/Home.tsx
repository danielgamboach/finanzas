import { useEffect, useMemo, useState } from 'react';
import { db } from '../lib/api';
import { categoryStats, inRange, monthRange, sumKind, sumSpend, weekRange, cardOutstanding, spend } from '../lib/calc';
import { cap, crLocal, dayLabel, money, monthName, todayCR } from '../lib/format';
import type { Tx } from '../lib/types';
import { go, useApp, useTxs } from '../store';
import { BigMoney, Icon, Loading, Nav, TopBar, tint } from '../ui';
import { TxRow } from '../ui/TxRow';
import { useNetWorth } from './Patrimonio';

export function MonthNav({ ym, setYm }: { ym: [number, number]; setYm: (v: [number, number]) => void }) {
  const t = todayCR();
  const isCurrent = ym[0] === t.y && ym[1] === t.m;
  const shift = (d: number) => {
    const dt = new Date(Date.UTC(ym[0], ym[1] + d, 1));
    setYm([dt.getUTCFullYear(), dt.getUTCMonth()]);
  };
  return (
    <div className="month-nav">
      <button className="icon-btn" onClick={() => shift(-1)} aria-label="Mes anterior">
        <Icon name="chevLeft" />
      </button>
      <span>{cap(monthName(ym[1]))} {ym[0]}</span>
      <button className="icon-btn" onClick={() => shift(1)} aria-label="Mes siguiente" disabled={isCurrent}>
        <Icon name="chevRight" />
      </button>
    </div>
  );
}

export function useMonth(): [[number, number], (v: [number, number]) => void] {
  const t = todayCR();
  const [ym, setYm] = useState<[number, number]>([t.y, t.m]);
  return [ym, setYm];
}

export function groupByDay(txs: Tx[]) {
  const out: { label: string; rows: Tx[]; total: number }[] = [];
  for (const t of txs) {
    const label = dayLabel(t.occurred_at);
    let g = out[out.length - 1];
    if (!g || g.label !== label) {
      g = { label, rows: [], total: 0 };
      out.push(g);
    }
    g.rows.push(t);
    g.total += spend(t);
  }
  return out;
}

export function Home() {
  const { space, categories, accounts, cur, fx, userId, bump, toast, profiles } = useApp();
  const [ym, setYm] = useMonth();
  const t = todayCR();
  const isCurrent = ym[0] === t.y && ym[1] === t.m;
  const month = monthRange(ym[0], ym[1]);
  const week = weekRange(space?.week_start ?? 5);
  const prevWeek = weekRange(space?.week_start ?? 5, -1);
  const range = useMemo(
    () => ({ from: [month.from, prevWeek.from].sort()[0], to: [month.to, week.to].sort()[1] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [month.from, month.to, prevWeek.from, week.to],
  );
  const { txs, loading } = useTxs(range);
  const [myContrib, setMyContrib] = useState(0);
  const worth = useNetWorth(space?.kind === 'personal' ? space.id : null);

  useEffect(() => {
    if (!space || space.kind !== 'personal' || !userId) return;
    db.from<Tx>('transactions', 'amount_crc')
      .eq('kind', 'contribution')
      .eq('contributor_id', userId)
      .gte('occurred_at', month.from)
      .lt('occurred_at', month.to)
      .then((rows) => setMyContrib(rows.reduce((a, r) => a + Number(r.amount_crc), 0)))
      .catch(() => setMyContrib(0));
  }, [space, userId, month.from, month.to]);

  if (!space) return <Loading />;

  const inMonth = txs.filter((x) => inRange(x, month));
  const spent = sumSpend(inMonth);
  const income = sumKind(inMonth, 'income');
  const contrib = sumKind(inMonth, 'contribution');
  const shared = space.kind === 'shared';
  const inflow = shared ? income + contrib : income;
  const left = inflow - spent - (shared ? 0 : myContrib);

  const stats = categoryStats(categories, txs, month, week, isCurrent);
  const alerts = stats.filter((s) => s.level === 'warn' || s.level === 'over');
  const cols = stats
    .filter((s) => s.limit || s.monthSpent > 0)
    .sort((a, b) => Number(a.cat.is_fixed) - Number(b.cat.is_fixed) || (b.pct ?? -1) - (a.pct ?? -1) || b.monthSpent - a.monthSpent);

  // Friday card payment (shared spaces with a credit card)
  const cards = accounts.filter((a) => a.kind === 'credit_card' && !a.archived);
  const cardIds = new Set(cards.map((c) => c.id));
  const onCards = (r: { from: string; to: string }) => sumSpend(txs.filter((x) => x.account_id && cardIds.has(x.account_id) && inRange(x, r)));
  const prevTotal = onCards(prevWeek);
  const curTotal = onCards(week);
  const prevKey = `card-week:${prevWeek.startKey}`;
  const prevPayment = txs.find((x) => x.external_id === prevKey);
  const pendingPrev = prevTotal > 0 && !prevPayment;
  const dueDate = crLocal(week.to);
  const daysLeft = Math.max(0, Math.round((new Date(week.to).getTime() - Date.now()) / 86400000));
  const debit = accounts.find((a) => a.kind === 'debit' && !a.archived);

  async function markPaid() {
    if (!space || !cards[0]) return;
    await db.insert('transactions', {
      space_id: space.id,
      kind: 'transfer',
      amount: Math.round(prevTotal * 100) / 100,
      currency: 'CRC',
      occurred_at: new Date().toISOString(),
      merchant: 'Pago de tarjeta',
      account_id: debit?.id ?? null,
      to_account_id: cards[0].id,
      source: 'system',
      external_id: prevKey,
    });
    toast('✅ Pago registrado');
    bump();
  }
  async function undoPaid() {
    if (!prevPayment) return;
    await db.remove('transactions', { id: prevPayment.id });
    toast('Pago deshecho');
    bump();
  }

  const recent = inMonth.slice(0, 7);
  const days: { label: string; rows: Tx[] }[] = [];
  recent.forEach((r) => {
    const label = dayLabel(r.occurred_at);
    const g = days[days.length - 1];
    if (g && g.label === label) g.rows.push(r);
    else days.push({ label, rows: [r] });
  });

  const anyCats = cols.length > 0;
  const others = Object.values(profiles).filter((p) => p.id !== userId).map((p) => p.name).filter(Boolean);

  return (
    <div className="screen">
      <TopBar />

      <section className="hero" aria-label="Balance del mes">
        <MonthNav ym={ym} setYm={setYm} />
        <span className="muted-label">Te queda en {monthName(ym[1])}</span>
        <BigMoney crc={left} />
        <div className="pills">
          <span className="pill">
            <span className="dot neg" aria-hidden="true">−</span>
            <span className="sr">Gastos:</span>
            {money(spent, cur, fx)}
          </span>
          <span className="pill">
            <span className="dot pos" aria-hidden="true">+</span>
            <span className="sr">{shared ? 'Aportes e ingresos:' : 'Ingresos:'}</span>
            {money(inflow, cur, fx)}
          </span>
          {!shared && myContrib > 0 && (
            <span className="pill">
              <span className="dot xfer" aria-hidden="true">→</span>
              <span className="sr">Aportado a espacios compartidos:</span>
              {money(myContrib, cur, fx)}
            </span>
          )}
        </div>
      </section>

      <div className="hscroll">
        <a className="action" href="#/agregar?tipo=gasto"><span>💸</span>Gasto</a>
        <a className="action" href="#/agregar?tipo=ingreso"><span>💰</span>Ingreso</a>
        <a className="action" href="#/agregar?tipo=transferir"><span>🔄</span>Transferir</a>
        {shared && <a className="action" href="#/agregar?tipo=aporte"><span>🤝</span>Aporte</a>}
      </div>

      {shared && cards.length > 0 && isCurrent && (
        <section className="bento butter" aria-label="Pago del viernes">
          <div className="row between">
            <span className="bento-title"><span>🗓️</span>Pago del viernes</span>
            <span className="badge">{pendingPrev ? 'Toca pagar' : daysLeft <= 1 ? 'Mañana' : `Faltan ${daysLeft} días`}</span>
          </div>
          {pendingPrev ? (
            <>
              <BigMoney crc={prevTotal} size={40} />
              <span className="bento-sub">Semana anterior · se paga hoy desde {debit?.name || 'la cuenta compartida'}</span>
              <button className="btn-dark" onClick={markPaid}>Marcar como pagado</button>
            </>
          ) : (
            <>
              <BigMoney crc={curTotal} size={40} />
              <span className="bento-sub">
                Lo que va de esta semana · se paga el vie {dueDate.getUTCDate()}
                {others.length > 0 ? ` · ${others.join(', ')} transfiere` : ''}
              </span>
              {prevPayment && (
                <button className="btn-light" onClick={undoPaid}>✅ Semana anterior pagada · Deshacer</button>
              )}
            </>
          )}
        </section>
      )}

      {!shared && (
        <a className="bento cyan" href="#/patrimonio">
          <div className="row between">
            <span className="bento-title"><span>💎</span>Patrimonio neto</span>
            <span className="round-dark-sm" aria-hidden="true"><Icon name="arrowUpRight" size={18} /></span>
          </div>
          <BigMoney crc={worth.net} size={40} />
          <span className="bento-sub">{worth.count} cuentas · {worth.stale > 0 ? `${worth.stale} por actualizar` : 'al día'}</span>
        </a>
      )}

      {alerts.length > 0 && (
        <a href="#/presupuesto" className={alerts.some((a) => a.level === 'over') ? 'alert over' : 'alert warn'}>
          <span className="alert-emoji">{alerts.some((a) => a.level === 'over') ? '🚨' : '⚠️'}</span>
          <span className="grow col">
            <strong>
              {alerts.filter((a) => a.level === 'over').length > 0
                ? `${alerts.filter((a) => a.level === 'over').length} excedida${alerts.filter((a) => a.level === 'over').length > 1 ? 's' : ''}`
                : `${alerts.length} cerca del límite`}
            </strong>
            <span>{alerts.map((a) => `${a.cat.name} al ${a.pct}%`).join(' · ')}</span>
          </span>
          <Icon name="chevRight" size={18} />
        </a>
      )}

      <section className="col gap12">
        <div className="section-head">
          <h2 className="h2">Categorías</h2>
          <a href="#/presupuesto" className="link">Ver todo</a>
        </div>
        {anyCats ? (
          <div className="hscroll">
            {cols.map((s) => {
              const fillH = s.limit ? Math.max(6, Math.round(Math.min(s.spent / s.limit, 1.25) * 150)) : 0;
              return (
                <a key={s.cat.id} href={`#/categoria/${s.cat.id}`} className="col-bar" style={{ background: tint(s.cat.color, false) }} aria-label={`${s.cat.name}: ${s.pct ?? '-'}%`}>
                  <span className="col-name">{s.cat.name}</span>
                  {s.limit ? (
                    <>
                      <span className="col-fill" style={{ height: fillH, background: s.level === 'over' ? '#F3B9B2' : tint(s.cat.color) }} />
                      <span className="col-limit" />
                    </>
                  ) : (
                    <span className="col-fill" style={{ height: 40, background: tint(s.cat.color) }} />
                  )}
                  <span className="col-info">
                    <span className="col-emoji">{s.cat.emoji}</span>
                    <span className="col-amt">{money(s.spent, cur, fx)}</span>
                    <span className={`col-pct lvl-${s.level}`}>{s.pct !== null ? `${s.pct}%` : 'Sin límite'}</span>
                  </span>
                </a>
              );
            })}
          </div>
        ) : (
          <div className="card empty">Todavía no hay gastos este mes.</div>
        )}
      </section>

      <section className="col gap12">
        <div className="section-head">
          <h2 className="h2">Movimientos</h2>
          <a href="#/movimientos" className="link">Ver todos</a>
        </div>
        <div className="card list">
          {loading && txs.length === 0 ? (
            <Loading />
          ) : days.length === 0 ? (
            <div className="empty">Sin movimientos en {monthName(ym[1])}. Tocá + para agregar uno.</div>
          ) : (
            days.map((d) => (
              <div key={d.label}>
                <span className="day-label">{d.label}</span>
                {d.rows.map((r) => (
                  <TxRow key={r.id} t={r} />
                ))}
              </div>
            ))
          )}
        </div>
      </section>

      <Nav active="home" />
    </div>
  );
}

export function goAdd(tipo: string) {
  go(`/agregar?tipo=${tipo}`);
}
