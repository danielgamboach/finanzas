import { useEffect, useMemo, useState } from 'react';
import { db } from '../lib/api';
import { inRange, monthBudget, monthRange, sumSpend, weekRange, spend } from '../lib/calc';
import { cap, crLocal, dateKey, dayLabel, money, monthName, monthShort, todayCR } from '../lib/format';
import type { Tx } from '../lib/types';
import { go, useApp, useTxs } from '../store';
import { BigMoney, Icon, Loading, Nav, TopBar } from '../ui';
import { TxRow } from '../ui/TxRow';

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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const DAY_LETTERS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

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
        <span className="ai-note-label">✨ Tu copiloto</span>
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

export function Home() {
  const { space, categories, accounts, cur, fx, bump, toast, profiles, userId } = useApp();
  const t = todayCR();
  const month = monthRange(t.y, t.m);
  const week = weekRange(space?.week_start ?? 5);
  const prevWeek = weekRange(space?.week_start ?? 5, -1);
  const range = useMemo(
    () => ({ from: [month.from, prevWeek.from].sort()[0], to: [month.to, week.to].sort()[1] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [month.from, month.to, prevWeek.from, week.to],
  );
  const { txs, loading } = useTxs(range);

  if (!space) return <Loading />;

  const shared = space.kind === 'shared';
  const inMonth = txs.filter((x) => inRange(x, month));
  const spent = sumSpend(inMonth);
  const budget = monthBudget(categories);
  const today = dateKey(new Date().toISOString());
  const fp = fingerprint(txs.filter((x) => inRange(x, month) || inRange(x, week)), categories, today);

  // This week, day by day (week_start → +6)
  const weekTxs = txs.filter((x) => inRange(x, week));
  const weekSpent = sumSpend(weekTxs);
  const nowIso = new Date().toISOString();
  const lastWeekSoFar = sumSpend(txs.filter((x) => x.occurred_at >= prevWeek.from && x.occurred_at < new Date(Date.now() - 7 * 86400000).toISOString()));
  const hasLastWeek = txs.some((x) => inRange(x, prevWeek));
  const days = Array.from({ length: 7 }, (_, i) => {
    const from = new Date(new Date(week.from).getTime() + i * 86400000).toISOString();
    const to = new Date(new Date(week.from).getTime() + (i + 1) * 86400000).toISOString();
    const local = crLocal(from);
    return { letter: DAY_LETTERS[local.getUTCDay()], total: sumSpend(weekTxs.filter((x) => inRange(x, { from, to }))), isToday: nowIso >= from && nowIso < to, future: from > nowIso };
  });
  const maxDay = Math.max(...days.map((d) => d.total), 1);
  const startL = crLocal(week.from);
  const endL = crLocal(new Date(new Date(week.to).getTime() - 1).toISOString());
  const diff = weekSpent - lastWeekSoFar;

  // Friday card payment (shared spaces with a credit card)
  const cards = accounts.filter((a) => a.kind === 'credit_card' && !a.archived);
  const cardIds = new Set(cards.map((c) => c.id));
  const prevOnCards = sumSpend(txs.filter((x) => x.account_id && cardIds.has(x.account_id) && inRange(x, prevWeek)));
  const prevKey = `card-week:${prevWeek.startKey}`;
  const prevPayment = txs.find((x) => x.external_id === prevKey);
  const pendingPrev = shared && cards.length > 0 && prevOnCards > 0 && !prevPayment;
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

  const recent = txs.filter((x) => x.occurred_at <= nowIso && x.kind !== 'transfer').slice(0, 3);

  return (
    <div className="screen">
      <TopBar />

      <h1 className="headline">
        {shared ? 'Llevan' : 'Llevás'} <strong>{money(spent, cur, fx)}</strong>
        {budget > 0 ? <> de {money(budget, cur, fx)}</> : null} en {monthName(t.m)}
      </h1>

      <AiNote spaceId={space.id} fp={fp} ready={!loading} />

      <section className="bento cyan week-card" aria-label="Gasto de esta semana">
        <div className="row between">
          <span className="bento-title"><span>🗓️</span>Esta semana</span>
          <span className="badge">
            {startL.getUTCMonth() === endL.getUTCMonth()
              ? `${startL.getUTCDate()} al ${endL.getUTCDate()} ${monthShort(endL.getUTCMonth())}`
              : `${startL.getUTCDate()} ${monthShort(startL.getUTCMonth())} al ${endL.getUTCDate()} ${monthShort(endL.getUTCMonth())}`}
          </span>
        </div>
        <BigMoney crc={weekSpent} size={44} />
        <span className="bento-sub">
          {hasLastWeek && lastWeekSoFar > 0
            ? diff > 0
              ? `${money(diff, cur, fx)} más que la semana pasada a esta altura`
              : diff < 0
                ? `${money(-diff, cur, fx)} menos que la semana pasada a esta altura`
                : 'Igual que la semana pasada a esta altura'
            : `${plural(weekTxs.filter((x) => x.kind === 'expense').length, 'compra', 'compras')}${shared && cards.length ? ' · la tarjeta se paga el viernes' : ''}`}
        </span>
        <div className="week-bars" aria-hidden="true">
          {days.map((d, i) => (
            <span key={i} className={`wb${d.isToday ? ' today' : ''}${d.future ? ' future' : ''}`}>
              <span className="wb-track">
                <span className="wb-fill" style={{ height: d.total > 0 ? `${Math.max(8, Math.round((d.total / maxDay) * 100))}%` : 0 }} />
              </span>
              <span className="wb-day">{d.letter}</span>
            </span>
          ))}
        </div>
        {pendingPrev && (
          <div className="week-pay">
            <span className="grow col">
              <strong>Toca pagar {money(prevOnCards, cur, fx)}</strong>
              <span>Tarjeta de la semana pasada{others.length ? ` · ${others.join(', ')} transfiere` : ''}</span>
            </span>
            <button className="btn-dark sm" onClick={markPaid}>Pagado</button>
          </div>
        )}
      </section>

      <section className="col gap12">
        <div className="section-head">
          <h2 className="h2">Últimos movimientos</h2>
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
