import { useEffect, useMemo, useState } from 'react';
import { db } from '../lib/api';
import { inRange, monthBudget, monthRange, sumSpend, weekRange, spend } from '../lib/calc';
import { cap, crLocal, dateKey, dayLabel, money, monthName, monthShort, todayCR } from '../lib/format';
import type { Tx } from '../lib/types';
import { go, useApp, useTxs } from '../store';
import { BigMoney, Icon, Loading, Nav, TopBar } from '../ui';
import { TxRow } from '../ui/TxRow';
import { MonthChart } from '../ui/MonthChart';
import { daysUntil, useRecurring } from '../lib/recurring';
import { RecRow } from './Recurrentes';

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

interface Insight { emoji: string; text: string; tone: 'good' | 'neutral' | 'warn' | 'bad'; fp: string; at: number }

/** Changes whenever something the message talks about changes: a new or edited movement, a limit, or the day. */
function fingerprint(txs: Tx[], categories: { id: string; limit_amount: number | null; limit_period: string | null }[], today: string) {
  let h = 5381;
  const feed = (s: string) => {
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  };
  feed(today);
  txs.forEach((t) => feed(`${t.id}${t.category_id}${t.amount_crc}${(t as Tx & { updated_at?: string }).updated_at || ''}`));
  categories.forEach((c) => feed(`${c.id}${c.limit_amount}${c.limit_period}`));
  return String(h >>> 0);
}

function readInsight(spaceId: string): Insight | null {
  try {
    const raw = localStorage.getItem(`finanzas.insight.${spaceId}`);
    return raw ? (JSON.parse(raw) as Insight) : null;
  } catch {
    return null;
  }
}
function writeInsight(spaceId: string, v: Insight) {
  try {
    localStorage.setItem(`finanzas.insight.${spaceId}`, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

function AiNote({ spaceId, fp, ready }: { spaceId: string; fp: string; ready: boolean }) {
  const [note, setNote] = useState<Insight | null>(() => readInsight(spaceId));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function load(force = false) {
    const cached = readInsight(spaceId);
    if (!force && cached && cached.fp === fp) return setNote(cached);
    if (!force && cached && Date.now() - cached.at < 20_000) return setNote(cached);
    setBusy(true);
    setFailed(false);
    try {
      const r = await db.fn<{ ok: boolean; emoji?: string; text?: string; tone?: Insight['tone'] }>('insight', { space_id: spaceId, prev: cached?.text });
      if (r.ok && r.text) {
        const v: Insight = { emoji: r.emoji || '✨', text: r.text, tone: r.tone || 'neutral', fp, at: Date.now() };
        writeInsight(spaceId, v);
        setNote(v);
      } else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setNote(readInsight(spaceId));
  }, [spaceId]);
  useEffect(() => {
    if (ready && fp) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, fp, ready]);

  if (!note && failed) return null;
  return (
    <section className={`ai-note tone-${note?.tone || 'neutral'}${busy && !note ? ' loading' : ''}`} aria-live="polite" aria-busy={busy}>
      <span className="ai-note-emoji" aria-hidden="true">{note?.emoji || '✨'}</span>
      <span className="ai-note-body">
        {note ? (
          <span className="ai-note-text">{note.text}</span>
        ) : (
          <span className="ai-note-skel" aria-label="Pensando…">
            <span />
            <span />
          </span>
        )}
      </span>
      <button className={busy ? 'ai-note-refresh spin' : 'ai-note-refresh'} onClick={() => load(true)} disabled={busy} aria-label="Otro mensaje">
        <Icon name="refresh" size={18} />
      </button>
    </section>
  );
}

/** Cumulative spend per day for a month, from day 1 up to `upTo` days. */
function cumulative(txs: Tx[], y: number, m: number, upTo: number) {
  const daily = new Array(upTo).fill(0);
  for (const t of txs) {
    const l = crLocal(t.occurred_at);
    if (l.getUTCFullYear() !== y || l.getUTCMonth() !== m) continue;
    const d = l.getUTCDate() - 1;
    if (d < upTo) daily[d] += spend(t);
  }
  let acc = 0;
  return daily.map((v) => (acc += v));
}

export function Home() {
  const { space, categories, accounts, cur, fx, bump, toast, profiles, userId } = useApp();
  const t = todayCR();
  const month = monthRange(t.y, t.m);
  const prevMonth = monthRange(t.y, t.m - 1);
  const week = weekRange(space?.week_start ?? 5);
  const prevWeek = weekRange(space?.week_start ?? 5, -1);
  const range = useMemo(
    () => ({ from: [prevMonth.from, prevWeek.from].sort()[0], to: [month.to, week.to].sort()[1] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prevMonth.from, prevWeek.from, month.to, week.to],
  );
  const { txs, loading } = useTxs(range);
  const { items: recs } = useRecurring(space?.id);
  const [sugCount, setSugCount] = useState(0);
  const { version } = useApp();
  useEffect(() => {
    if (!space) return;
    db.rpc<unknown[]>('recurring_suggestions', { p_space: space.id }).then((r) => setSugCount(r.length)).catch(() => setSugCount(0));
  }, [space, version]);

  if (!space) return <Loading />;

  const shared = space.kind === 'shared';
  const inMonth = txs.filter((x) => inRange(x, month));
  const spent = sumSpend(inMonth);
  const budget = monthBudget(categories);
  const available = budget - spent;
  const today = dateKey(new Date().toISOString());
  const fp = fingerprint(txs.filter((x) => inRange(x, month) || inRange(x, week)), categories, today);

  // chart + comparison with last month at this same point
  const daysInMonth = new Date(Date.UTC(t.y, t.m + 1, 0)).getUTCDate();
  const pl = crLocal(prevMonth.from);
  const prevDays = new Date(Date.UTC(pl.getUTCFullYear(), pl.getUTCMonth() + 1, 0)).getUTCDate();
  const curSeries = cumulative(inMonth, t.y, t.m, t.d);
  const prevTxs = txs.filter((x) => inRange(x, prevMonth));
  const prevSeries = prevTxs.length ? cumulative(prevTxs, pl.getUTCFullYear(), pl.getUTCMonth(), prevDays) : null;
  const prevSoFar = prevSeries ? prevSeries[Math.min(t.d, prevDays) - 1] : 0;
  const diff = spent - prevSoFar;
  const fmt = (v: number) => money(v, cur, fx);

  const weekSpent = sumSpend(txs.filter((x) => inRange(x, week)));
  const ws = crLocal(week.from);
  const we = crLocal(new Date(new Date(week.to).getTime() - 1).toISOString());

  // Friday card payment (shared spaces with a credit card)
  const cards = accounts.filter((a) => a.kind === 'credit_card' && !a.archived);
  const cardIds = new Set(cards.map((c) => c.id));
  const prevOnCards = sumSpend(txs.filter((x) => x.account_id && cardIds.has(x.account_id) && inRange(x, prevWeek)));
  const prevKey = `card-week:${prevWeek.startKey}`;
  const pendingPrev = shared && cards.length > 0 && prevOnCards > 0 && !txs.some((x) => x.external_id === prevKey);
  const debit = accounts.find((a) => a.kind === 'debit' && !a.archived);
  const others = Object.values(profiles).filter((p) => p.id !== userId).map((p) => p.name).filter(Boolean);

  async function markPaid() {
    if (!space || !cards[0]) return;
    await db.insert('transactions', {
      space_id: space.id,
      kind: 'transfer',
      amount: Math.round(prevOnCards * 100) / 100,
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

  const upcoming = recs.filter((r) => r.active && daysUntil(r.next_due) <= 31).slice(0, 5);
  const nowIso = new Date().toISOString();
  const recent = txs.filter((x) => x.occurred_at <= nowIso && x.kind !== 'transfer').slice(0, 5);

  return (
    <div className="screen">
      <TopBar />

      <section className="card pad month-card" aria-label={`Resumen de ${monthName(t.m)}`}>
        <div className="row between">
          <span className={budget > 0 && available < 0 ? 'muted-label big-label neg' : 'muted-label'}>
            {budget > 0 ? (available >= 0 ? 'Disponible para gastar' : 'Se pasaron del presupuesto por') : `Gastado en ${monthName(t.m)}`}
          </span>
          <span className="date-pill nowrap">{cap(monthShort(t.m))} · día {t.d}</span>
        </div>
        <BigMoney crc={budget > 0 ? Math.abs(available) : spent} size={48} />
        <MonthChart
          current={curSeries}
          previous={prevSeries}
          days={daysInMonth}
          budget={budget}
          curLabel={cap(monthName(t.m))}
          prevLabel={cap(monthName(pl.getUTCMonth()))}
          fmt={fmt}
        />
        <div className="stats3">
          <div className="stat">
            <span className="stat-label">Gastado</span>
            <span className="stat-value">{fmt(spent)}</span>
            <span className="stat-sub">{budget > 0 ? `de ${fmt(budget)}` : <a href="#/presupuesto">Definir presupuesto</a>}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Esta semana</span>
            <span className="stat-value">{fmt(weekSpent)}</span>
            <span className="stat-sub">{ws.getUTCDate()} al {we.getUTCDate()} {monthShort(we.getUTCMonth())}</span>
          </div>
          <div className="stat">
            <span className="stat-label">vs. {monthShort(pl.getUTCMonth())}</span>
            {prevSeries ? (
              <span className={diff > 0 ? 'stat-value up' : 'stat-value down'}>{diff > 0 ? '↑ ' : '↓ '}{fmt(Math.abs(diff))}</span>
            ) : (
              <span className="stat-value">—</span>
            )}
            <span className="stat-sub">{prevSeries ? (diff > 0 ? 'más a esta altura' : 'menos a esta altura') : 'sin datos'}</span>
          </div>
        </div>
      </section>

      <AiNote spaceId={space.id} fp={fp} ready={!loading} />

      <section className="col gap12">
        <div className="section-head">
          <h2 className="h2">Próximos pagos</h2>
          <a href="#/recurrentes" className="link">Ver todos</a>
        </div>
        {upcoming.length === 0 && !pendingPrev ? (
          <a className="card empty center" href={recs.length ? '#/recurrentes' : '#/recurrente/nueva'}>
            <span className="big-emoji">🔁</span>
            <strong>{recs.length ? 'Nada en los próximos 30 días' : 'Agregá tus pagos fijos'}</strong>
            <span>{recs.length ? 'Todo al día.' : 'Alquiler, internet, suscripciones…'}</span>
          </a>
        ) : (
          <div className="card list">
            {pendingPrev && (
              <div className="rec-row ask">
                <div className="tx-row">
                  <span className="emo" aria-hidden="true" style={{ width: 48, height: 48, fontSize: 22, background: '#F6CFDF' }}>💳</span>
                  <span className="tx-mid">
                    <span className="tx-cat">Semana pasada{others.length ? ` · ${others.join(', ')} transfiere` : ''}</span>
                    <span className="tx-name">Pago de tarjeta</span>
                  </span>
                  <span className="tx-amt"><span>{fmt(prevOnCards)}</span><span className="tx-sub strong">Toca pagar</span></span>
                </div>
                <div className="rec-ask">
                  <span>¿Ya se pagó la tarjeta?</span>
                  <button className="btn-dark sm" onClick={markPaid}>Ya pagué</button>
                </div>
              </div>
            )}
            {upcoming.map((r) => <RecRow key={r.id} r={r} compact />)}
          </div>
        )}
        {sugCount > 0 && (
          <a className="hint-link" href="#/recurrentes">✨ {sugCount === 1 ? 'Encontré 1 posible suscripción' : `Encontré ${sugCount} posibles suscripciones`} · Revisar</a>
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
          ) : recent.length === 0 ? (
            <div className="empty">Todavía no hay movimientos. Tocá + para agregar uno.</div>
          ) : (
            recent.map((r) => <TxRow key={r.id} t={r} showDate />)
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
