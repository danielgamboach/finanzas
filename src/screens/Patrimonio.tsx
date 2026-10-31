import { useMenu } from '../lib/menu';
import { useEffect, useState } from 'react';
import { AccountGroup, AccountRow, BalanceSummary, Button, EmptyState, GroupSkeleton, ListGroup, ListRow, Loader, PageHeader, Progress, SummarySkeleton, Switch, TxListSkeleton, ActionBar } from '../ds';
import { PageSkeleton } from '../ui/Skeletons';
import { db } from '../lib/api';
import { accountBalanceAt, snapshotMoment } from '../lib/calc';
import { cardStatus, hasOwed, isAdditional, owedCrc, type CardStatus, type Owed } from '../lib/cards';
import { CardCycle, CardPaySheet, owedText } from '../ui/CardPay';
import { amount, crIso, money, moneyRaw, parseAmount, shortDate, todayCR, unitOf } from '../lib/format';
import type { Account, Goal, Recurring, Snapshot, Tx } from '../lib/types';
import { go, navigate, navigateBack, useApp } from '../store';
import { Emo, Icon, Loading, tint } from '../ui';
import { ACCOUNT_COLORS, accountColor, BRANDS, byKind } from '../lib/accounts';
import { MovementsBrowser } from './Movimientos';
import { useDesktop } from '../lib/useDesktop';

const ASSET_KINDS = ['savings', 'investment', 'cdp', 'cash', 'debit', 'other'];
const KIND_LABEL: Record<string, string> = {
  credit_card: 'Tarjeta de crédito', debit: 'Débito o corriente', savings: 'Ahorro', investment: 'Inversión', cash: 'Efectivo', cdp: 'CDP / plazo', loan: 'Préstamo', other: 'Otra',
};
/** What each kind of account can do (CTA-12), said once under the kind picker. */
const KIND_HINT: Record<string, string> = {
  credit_card: 'Paga gastos. Lo que se debe baja con un pago desde otra cuenta.',
  cdp: 'No paga gastos. Recibe sus intereses y se le puede sacar dinero a otra cuenta.',
  investment: 'No paga gastos. Recibe rendimientos y se puede mover dinero desde y hacia ella.',
  loan: 'No paga gastos ni manda dinero. Solo recibe cuotas y abonos desde otras cuentas.',
};
export const KIND_EMOJI: Record<string, string> = { credit_card: '💳', debit: '🏦', savings: '🐷', investment: '📈', cash: '💵', cdp: '🔒', loan: '🧾', other: '🗂️' };

export interface WorthData {
  accounts: Account[];
  /** The last balance typed in for each account. */
  latest: Record<string, Snapshot | undefined>;
  /** What each account (not a card) has now, in its own currency: the last balance typed in plus what moved since. */
  balance: Record<string, number | undefined>;
  snaps: Snapshot[];
  cardDebt: Record<string, number>;
  cardSplit: Record<string, Owed>;
  /** Main cards: statement, due date, what's left to pay (TAR). */
  cardInfo: Record<string, CardStatus>;
  cards: number;
  assets: number;
  savings: number;
  investments: number;
  debts: number;
  net: number;
  count: number;
  stale: number;
  history: { m: number; v: number }[];
  loading: boolean;
  reload: () => void;
}

const toCrc = (v: number, a: Account, fx: number) => (a.currency === 'USD' ? v * fx : v);

const TXW = 'id,kind,amount,currency,amount_crc,account_id,to_account_id,occurred_at,hold,external_id,installments';

export function useNetWorth(spaceId: string | null): WorthData {
  const { fx, version } = useApp();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  // movements of the space: the cards' debt and what moved each account since its last typed-in balance
  const [cardTx, setCardTx] = useState<Tx[]>([]);
  const [rates, setRates] = useState<{ rate_date: string; crc_per_usd: number }[]>([]);
  const [txFrom, setTxFrom] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!spaceId) return;
    let alive = true;
    setLoading(true);
    (async () => {
      const accs = await db.from<Account>('accounts').eq('space_id', spaceId).eq('archived', false).order('created_at');
      const ids = accs.map((a) => a.id);
      const s = ids.length ? await db.from<Snapshot>('balance_snapshots').in('account_id', ids).order('taken_on', false).limit(1000) : [];
      // movements: the cards' last two months, and everything since the oldest balance still in use
      const newest: Record<string, Snapshot> = {};
      for (const x of s) if (!newest[x.account_id]) newest[x.account_id] = x;
      const bases = Object.values(newest).map(snapshotMoment).sort();
      const hasCards = accs.some((a) => a.kind === 'credit_card');
      // cards: enough for the last two statements
      const from = [hasCards ? new Date(Date.now() - 75 * 86400000).toISOString() : null, bases[0] || null].filter(Boolean).sort()[0] as string | undefined;
      const [ct, rates] = from
        ? await Promise.all([
            Promise.all([
              db.from<Tx>('transactions', TXW).or(`space_id.eq.${spaceId}`, `to_space_id.eq.${spaceId}`).gte('occurred_at', from).limit(5000),
              // installment purchases keep charging the card for months (TAR-11): the older ones too
              hasCards ? db.from<Tx>('transactions', TXW).eq('space_id', spaceId).gte('installments', 2).lt('occurred_at', from).gte('occurred_at', new Date(Date.now() - 1830 * 86400000).toISOString()).limit(500).then((r) => r, () => []) : Promise.resolve([] as Tx[]),
            ]).then(([a, b]) => [...a, ...b].filter((t) => t.hold !== 'void')),
            db.from<{ rate_date: string; crc_per_usd: number }>('fx_rates', 'rate_date,crc_per_usd').gte('rate_date', new Date(new Date(from).getTime() - 10 * 86400000).toISOString().slice(0, 10)).order('rate_date', false).limit(400).then((r) => r, () => []),
          ])
        : [[], []];
      if (!alive) return;
      setAccounts(accs);
      setSnaps(s);
      setCardTx(ct);
      setRates(rates);
      setTxFrom(from || null);
      setLoading(false);
    })().catch(() => setLoading(false));
    return () => {
      alive = false;
    };
  }, [spaceId, version, tick]);

  // colones per dollar on a movement's day (Costa Rica), for movements in the other currency
  const rateOn = (iso: string) => {
    const day = new Date(new Date(iso).getTime() - 6 * 3600000).toISOString().slice(0, 10);
    return Number(rates.find((r) => r.rate_date <= day)?.crc_per_usd) || fx;
  };
  const nowIso = new Date().toISOString();

  const latest: Record<string, Snapshot | undefined> = {};
  for (const s of snaps) if (!latest[s.account_id]) latest[s.account_id] = s;
  const balance: Record<string, number | undefined> = {};
  let savings = 0, investments = 0, debts = 0, stale = 0, cards = 0;
  const cardDebt: Record<string, number> = {};
  const cardSplit: Record<string, Owed> = {};
  const cardInfo: Record<string, CardStatus> = {};
  const now = Date.now();
  for (const a of accounts) {
    if (a.kind === 'credit_card') {
      // an additional card's charges are owed on its main card (TAR-07)
      if (isAdditional(a)) continue;
      const st = cardStatus(a, accounts, snaps, cardTx, nowIso);
      const owed = Math.max(0, owedCrc(st.owed, fx));
      cardInfo[a.id] = st;
      cardDebt[a.id] = owed;
      cardSplit[a.id] = st.owed;
      debts += owed;
      cards += owed;
      continue;
    }
    // the cash account without a balance: its movements count as spending, but it has no balance
    if (a.track_balance === false) continue;
    const s = latest[a.id];
    const b = accountBalanceAt(a, snaps, cardTx, nowIso, rateOn, txFrom || undefined);
    if (b !== null) balance[a.id] = b;
    const v = b !== null ? toCrc(b, a, fx) : 0;
    if (!s || now - new Date(s.taken_on).getTime() > 10 * 86400000) stale++;
    if (a.kind === 'loan') debts += Math.abs(v);
    else if (a.kind === 'investment') investments += v;
    else if (ASSET_KINDS.includes(a.kind)) savings += v;
  }
  const t = todayCR();
  const history = Array.from({ length: 6 }, (_, i) => {
    const end = crIso(t.y, t.m - 4 + i, 1).slice(0, 10);
    let v = 0;
    const until = new Date(`${end}T00:00:00-06:00`).getTime() > now ? nowIso : new Date(`${end}T00:00:00-06:00`).toISOString();
    for (const a of accounts) {
      if (a.kind === 'credit_card' || a.track_balance === false) continue;
      const b = accountBalanceAt(a, snaps, cardTx, until, rateOn, txFrom || undefined);
      if (b === null) continue;
      const c = toCrc(b, a, fx);
      v += a.kind === 'loan' ? -Math.abs(c) : c;
    }
    return { m: (t.m - 5 + i + 12) % 12, v };
  });
  const tracked = accounts.filter((a) => a.kind !== 'credit_card' && a.track_balance !== false).length;
  return {
    accounts, latest, balance, snaps, cardDebt, cardSplit, cardInfo, cards, assets: savings + investments, savings, investments, debts,
    net: savings + investments - debts, count: tracked, stale, history, loading, reload: () => setTick((x) => x + 1),
  };
}

function cardLine(x?: Owed) {
  if (!x || !hasOwed(x)) return 'Al día desde el último pago';
  return `Por pagar: ${owedText(x)}`;
}

const GROUPS: { title: string; kinds: string[] }[] = [
  { title: 'Tarjetas de crédito', kinds: ['credit_card'] },
  { title: 'Débito y ahorro', kinds: ['debit', 'savings', 'cash', 'other'] },
  { title: 'Inversión', kinds: ['investment', 'cdp'] },
  { title: 'Préstamos', kinds: ['loan'] },
];

/** The filled icon and short name of each kind, for the account rows. */
const KIND_ICON: Record<string, string> = { credit_card: 'cards', debit: 'bank', savings: 'piggy', investment: 'chartHistogram', cash: 'money', cdp: 'lock', loan: 'receipt', other: 'folder' };
const KIND_SHORT: Record<string, string> = { credit_card: 'Crédito', debit: 'Débito', savings: 'Ahorro', investment: 'Inversión', cash: 'Efectivo', cdp: 'CDP Plazo', loan: 'Préstamo', other: 'Otra' };

/** The kind's filled icon in the account's color (graphite would vanish: its foreground shows). */
export function accountIcon(a: Partial<Account>) {
  const c = accountColor(a);
  return { name: KIND_ICON[a.kind || 'other'] || 'folder', color: (a.color || 'graphite') === 'graphite' ? c.fg : c.bg };
}

/** One account as a row of Cuentas: balance in its own currency (cards: what's owed, in the display currency) and, for investments, the change since the previous balance. */
export function AccountListRow({ a, w }: { a: Account; w: WorthData }) {
  const { cur, fx } = useApp();
  const c = accountColor(a);
  // the dark graphite would vanish on the list: its foreground shows instead
  const color = (a.color || 'graphite') === 'graphite' ? c.fg : c.bg;
  const details = [a.kind === 'credit_card' ? 'USD/CRC' : a.currency, KIND_SHORT[a.kind] || '', a.last4 ? `**${a.last4}` : ''];
  let amt: string, muted = false, delta: { text: string; tone: 'positive' | 'negative' } | undefined;
  if (a.kind === 'credit_card' && a.parent_account_id) {
    // an additional card: what it charges is owed on its main card
    amt = 'Adicional';
    muted = true;
  } else if (a.kind === 'credit_card') {
    // one figure in the display currency; the split by currency lives in the card's own view
    amt = `${amount(w.cardDebt[a.id] || 0, cur, fx)} ${unitOf(cur)}`;
  } else if (a.track_balance === false) {
    amt = 'Sin saldo';
    muted = true;
  } else {
    const s = w.latest[a.id];
    if (!s) {
      amt = 'Sin saldo';
      muted = true;
    } else {
      amt = `${amount(w.balance[a.id] ?? Number(s.balance), a.currency, 1, { decimals: false })} ${a.currency}`;
      if (a.kind === 'investment' || a.kind === 'cdp') {
        const prev = w.snaps.find((x) => x.account_id === a.id && x.id !== s.id);
        const d = prev ? Number(s.balance) - Number(prev.balance) : 0;
        if (prev && Math.abs(d) >= 0.01) {
          const pct = Number(prev.balance) ? (d / Math.abs(Number(prev.balance))) * 100 : 0;
          const sign = d > 0 ? '+' : '−';
          delta = { text: `${moneyRaw(d, a.currency, { sign })} (${sign}${Math.abs(pct).toFixed(2).replace('.', ',')}%)`, tone: d > 0 ? 'positive' : 'negative' };
        }
      }
    }
  }
  return <AccountRow icon={KIND_ICON[a.kind] || 'folder'} color={color} name={a.name} details={details} amount={amt} amountMuted={muted} delta={delta} href={`#/cuenta/${a.id}`} />;
}

/** What a card shows as its main number. */
function accountFigure(a: Account, w: WorthData) {
  if (a.kind === 'credit_card') {
    const line = cardLine(w.cardSplit[a.id]);
    return line.startsWith('Por pagar') ? { main: line.replace('Por pagar: ', ''), sub: 'Por pagar', stale: false } : { main: moneyRaw(0, 'CRC'), sub: 'Al día', stale: false };
  }
  const s = w.latest[a.id];
  const stale = !s || Date.now() - new Date(s.taken_on).getTime() > 10 * 86400000;
  return { main: s ? moneyRaw(w.balance[a.id] ?? Number(s.balance), a.currency) : 'Sin saldo', sub: s ? `Saldo · ${shortDate(s.taken_on + 'T18:00:00Z')}` : 'Agregá el saldo', stale };
}

/** One account drawn as a card. `full` shows the bottom half (number and brand). */
export function AccountCard({ a, w, onClick, style, big = false }: { a: Account; w: WorthData; onClick?: () => void; style?: React.CSSProperties; big?: boolean }) {
  const c = accountColor(a);
  const f = accountFigure(a, w);
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={big ? 'wcard big' : 'wcard'} data-acc={a.id} style={{ background: c.bg, color: c.fg, viewTransitionName: `card-${a.id}`, ...style } as React.CSSProperties} onClick={onClick}>
      <span className="wc-top">
        <span className="wc-name">{a.name}</span>
        <span className="wc-num">{a.last4 ? `••••${a.last4}` : a.institution || ''}</span>
      </span>
      <span className="wc-bottom">
        <span className="col">
          <span className="wc-sub">{f.stale && a.kind !== 'credit_card' && <Icon name="clock" size={12} />}{f.sub}</span>
          <span className="wc-amt">{f.main}</span>
        </span>
        {a.brand ? <span className="wc-brand">{BRANDS[a.brand]}</span> : <span className="wc-kind" aria-hidden="true"><Icon name={KIND_ICON[a.kind] || 'folder'} size={24} solid /></span>}
      </span>
    </Tag>
  );
}

/** Accounts as a wallet: the panel to the right of home. */
export function Cuentas() {
  const { space, cur, fx } = useApp();
  const w = useNetWorth(space?.id || null);
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const { version } = useApp();
  useEffect(() => {
    if (!space) return;
    db.from<Goal>('goals', '*,goal_accounts(account_id)').eq('space_id', space.id).order('created_at').then(setGoals).catch(() => setGoals([]));
  }, [space, version]);

  const desk = useDesktop();
  const menu = useMenu();
  if (!space) return <PageSkeleton title="Cuentas" heroAction><GroupSkeleton rows={2} leading="icon" /><GroupSkeleton rows={2} leading="icon" /></PageSkeleton>;
  const accs = [...w.accounts].sort(byKind);
  const hasAssets = accs.some((a) => a.kind !== 'credit_card');

  const groups = w.loading && accs.length === 0 ? (
    <Loader><GroupSkeleton rows={2} leading="icon" /><GroupSkeleton rows={2} leading="icon" start={2} /></Loader>
  ) : accs.length === 0 ? (
    <EmptyState icon={<Icon name="cards" size={24} />} title="Agregá tus cuentas" action={<Button variant="primary" size="sm" href="#/cuenta/nueva" leading={<Icon name="plus" size={16} solid />}>Nueva cuenta</Button>}>
      Tarjetas, ahorros, inversiones. Con el saldo de cada una sale tu patrimonio.
    </EmptyState>
  ) : (
    GROUPS.map((g) => {
      const list = accs.filter((a) => g.kinds.includes(a.kind));
      if (!list.length) return null;
      return (
        <AccountGroup key={g.title} title={g.title}>
          {list.map((a) => <AccountListRow key={a.id} a={a} w={w} />)}
        </AccountGroup>
      );
    })
  );
  const goalList = goals === null ? <Loader><GroupSkeleton rows={1} below /></Loader> : (
    <ListGroup title="Metas" action={<a href="#/meta/nueva">Nueva</a>}>
      {goals.length === 0 ? (
        <ListRow leading={<Emo icon="target" color="butter" size={40} />} title="Creá tu primera meta" detail="Ej. Casa, con las cuentas que suman" chevron href="#/meta/nueva" />
      ) : (
        goals.map((gl) => {
          const linked = (gl.goal_accounts || []).map((x) => w.accounts.find((a) => a.id === x.account_id)).filter(Boolean) as Account[];
          const saved = linked.reduce((acc, a) => acc + (w.balance[a.id] !== undefined ? toCrc(w.balance[a.id]!, a, fx) : 0), 0);
          const target = gl.currency === 'USD' ? Number(gl.target_amount) * fx : Number(gl.target_amount);
          const pct = target ? Math.min(100, Math.round((saved / target) * 100)) : 0;
          return (
            <ListRow
              key={gl.id}
              leading={<Emo icon="target" color={gl.color || 'butter'} size={40} />}
              title={gl.name}
              detail={`${money(saved, cur, fx)} de ${money(target, cur, fx)}`}
              value={`${pct}%`}
              chevron
              href={`#/meta/${gl.id}`}
              below={<Progress size="sm" value={pct / 100} label={`${gl.name}: ${pct}%`} />}
            />
          );
        })
      )}
    </ListGroup>
  );
  const worth = hasAssets && (
    <BalanceSummary
      label="Patrimonio neto"
      value={amount(w.net, cur, fx, { sign: w.net < 0 ? '−' : '' })}
      unit={unitOf(cur)}
      negative={w.net < 0}
      meta={w.stale ? (w.stale === 1 ? '1 saldo sin actualizar' : `${w.stale} saldos sin actualizar`) : null}
      action={<Button variant="primary" size="xs" leading={<Icon name="refresh" size={16} />} href="#/saldos">Saldos</Button>}
    />
  );

  if (desk) {
    // desktop: the same lists, with net worth and goals in a column on the right
    return (
      <div className="dpage">
        <header className="dpage-head">
          <h1 className="dtitle">Cuentas</h1>
          <Button variant="primary" size="sm" leading={<Icon name="plus" size={16} solid />} href="#/cuenta/nueva">Nueva cuenta</Button>
        </header>
        <div className="dgrid cuentas-grid">
          <div className="dcol">{groups}</div>
          <aside className="dcol gap24">
            {worth}
            {goalList}
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader title="Cuentas" onMenu={menu?.open} actions={<Button variant="secondary" size="xs" iconOnly href="#/cuenta/nueva" aria-label="Agregar cuenta"><Icon name="plus" size={16} solid /></Button>} />
      {worth ? <div className="page-hero">{worth}</div> : w.loading && accs.length === 0 ? <div className="page-hero"><Loader><SummarySkeleton action /></Loader></div> : null}
      <div className="page-body">
        {groups}
        {goalList}
      </div>
    </div>
  );
}

/** Pagar: opens the card's payment sheet (TAR-04). */
function CardPayButton({ a }: { a: Account }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" size="xs" leading={<Icon name="check" size={16} />} onClick={() => setOpen(true)}>Pagar</Button>
      {open && <CardPaySheet cardId={a.id} onClose={() => setOpen(false)} />}
    </>
  );
}

/** One account: the key number, the action that updates it, and its movements with filters. */
export function AccountView({ id }: { id: string }) {
  const { space, accounts, cur, fx } = useApp();
  const w = useNetWorth(space?.id || null);
  const desk = useDesktop();
  const a = w.accounts.find((x) => x.id === id) || accounts.find((x) => x.id === id);
  if (!a) return <PageSkeleton back nav={false} heroAction><TxListSkeleton /></PageSkeleton>;
  const isCard = a.kind === 'credit_card';
  const s = w.latest[a.id];
  const details = [KIND_LABEL[a.kind], a.institution, a.last4 ? `**${a.last4}` : ''].filter(Boolean).join(' · ');
  let hero: React.ReactNode;
  let extra: React.ReactNode = null;
  if (isCard && a.parent_account_id) {
    // an additional card: its charges are owed (and paid) on the main card
    const main = w.accounts.find((x) => x.id === a.parent_account_id) || accounts.find((x) => x.id === a.parent_account_id);
    hero = (
      <BalanceSummary
        label="Tarjeta adicional"
        value={amount(w.cardDebt[a.parent_account_id] || 0, cur, fx)}
        unit={unitOf(cur)}
        meta={[`Lo que cargás aquí se debe y se paga en ${main?.name || 'la tarjeta principal'}`, details].join(' · ')}
        action={<Button variant="primary" size="xs" href={`#/cuenta/${a.parent_account_id}`}>Ver {main?.name || 'principal'}</Button>}
      />
    );
  } else if (isCard) {
    const split = w.cardSplit[a.id];
    const both = split && Math.abs(split.CRC) >= 1 && Math.abs(split.USD) >= 0.01;
    const owed = w.cardDebt[a.id] || 0;
    hero = (
      <BalanceSummary
        label={owed > 0 ? 'Debés' : 'Al día'}
        value={amount(owed, cur, fx)}
        unit={unitOf(cur)}
        meta={both ? `${owedText(split)} · ${details}` : details}
        action={<CardPayButton a={a} />}
      />
    );
    extra = w.loading ? null : <CardCycle card={a} info={w.cardInfo[a.id]} />;
  } else if (a.track_balance === false) {
    hero = (
      <BalanceSummary
        label="Sin saldo"
        value="0"
        unit={a.currency}
        meta="Lo que pagás en efectivo cuenta en el mes. Para llevar el saldo, editá la cuenta."
        action={<Button variant="primary" size="xs" leading={<Icon name="pencil" size={14} />} href={`#/cuenta/${a.id}/editar`}>Llevar saldo</Button>}
      />
    );
  } else {
    // the balance now; when movements moved it since the last one typed in, say where it started
    const now = w.balance[a.id] ?? Number(s?.balance || 0);
    const moved = Boolean(s) && Math.abs(now - Number(s!.balance)) >= 0.01;
    const since = s ? shortDate(s.taken_on + 'T18:00:00Z') : '';
    hero = (
      <BalanceSummary
        label={s ? 'Saldo' : 'Sin saldo'}
        value={s ? amount(now, a.currency, 1) : '0'}
        unit={a.currency}
        meta={s ? [details, moved ? `Desde ${moneyRaw(Number(s.balance), a.currency)} el ${since}, más movimientos` : `Saldo del ${since}`].filter(Boolean).join(' · ') : details}
        action={<Button variant="primary" size="xs" leading={<Icon name="refresh" size={16} />} href="#/saldos">Actualizar saldo</Button>}
      />
    );
  }
  const edit = <Button variant="secondary" size="xs" iconOnly href={`#/cuenta/${a.id}/editar`} aria-label="Editar cuenta"><Icon name="pencil" size={14} /></Button>;
  if (desk) {
    return (
      <div className="dpage">
        <header className="dpage-head">
          <div className="row gap12">
            <Button variant="secondary" size="xs" iconOnly href="#/cuentas" aria-label="Volver a cuentas"><Icon name="back" size={12} stroke={2.4} /></Button>
            <h1 className="dtitle">{a.name}</h1>
          </div>
          <Button variant="secondary" size="sm" leading={<Icon name="pencil" size={16} />} href={`#/cuenta/${a.id}/editar`}>Editar cuenta</Button>
        </header>
        <div className="dgrid account-grid">
          <div className="dcol dsticky gap24">{hero}{extra}</div>
          <section className="dmov">
            <h2 className="group-head">Movimientos</h2>
            <MovementsBrowser accountId={a.id} screen={`acc:${a.id}`} table />
          </section>
        </div>
      </div>
    );
  }
  return (
    <div className="page no-nav">
      <PageHeader title={a.name} onBack={navigateBack} actions={edit} />
      <div className="page-hero">{hero}</div>
      <div className="page-body">
        {extra}
        <h2 className="group-head">Movimientos</h2>
        <MovementsBrowser accountId={a.id} screen={`acc:${a.id}`} />
      </div>
    </div>
  );
}

export function Saldos() {
  const { space, toast, bump } = useApp();
  const w = useNetWorth(space?.id || null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const editable = w.accounts.filter((a) => a.kind !== 'credit_card' && a.track_balance !== false);

  async function save() {
    setBusy(true);
    const today = new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10);
    const rows = Object.entries(vals)
      .filter(([, v]) => v.trim() !== '')
      .map(([account_id, v]) => ({ account_id, balance: parseAmount(v), taken_on: today, created_at: new Date().toISOString() }));
    if (rows.length) await db.upsert('balance_snapshots', rows, 'account_id,taken_on');
    bump();
    toast(`${rows.length} saldo${rows.length === 1 ? '' : 's'} actualizado${rows.length === 1 ? '' : 's'}`);
    setBusy(false);
    history.back();
  }

  return (
    <div className="page no-nav">
      <PageHeader title="Actualizar saldos" onBack={navigateBack} />
      <div className="page-body">
        <p className="page-text">Poné el saldo de hoy de cada cuenta. Dejá en blanco las que no cambiaron.</p>
        {w.loading ? <Loader><GroupSkeleton rows={3} title={false} leading="icon" value={false} action /></Loader> : editable.length === 0 ? (
          <EmptyState icon={<Icon name="bank" size={24} />} title="Primero agregá una cuenta" action={<Button variant="primary" size="sm" href="#/cuenta/nueva">Nueva cuenta</Button>} />
        ) : (
          <ListGroup>
            {editable.map((a) => {
              const ic = accountIcon(a);
              const last = w.latest[a.id];
              return (
                <ListRow
                  key={a.id}
                  leading={<ListRow.Icon name={ic.name} color={ic.color} />}
                  title={a.name}
                  detail={last ? `Ahora ${moneyRaw(w.balance[a.id] ?? Number(last.balance), a.currency)}` : 'Sin saldo todavía'}
                  actions={
                    <label className="saldo-input">
                      <span>{a.currency === 'USD' ? '$' : '¢'}</span>
                      <input inputMode="decimal" value={vals[a.id] || ''} onChange={(e) => setVals({ ...vals, [a.id]: e.target.value.replace(/[^0-9.,-]/g, '') })} placeholder="0" aria-label={`Saldo de ${a.name}`} />
                    </label>
                  }
                />
              );
            })}
          </ListGroup>
        )}
      </div>
      <ActionBar>
        <Button variant="primary" size="lg" block onClick={save} disabled={busy || !Object.values(vals).some((v) => v.trim())}>{busy ? 'Guardando…' : 'Guardar saldos'}</Button>
      </ActionBar>
    </div>
  );
}

export function AccountEdit({ id }: { id: string }) {
  const { space, spaces, toast, reloadMeta, bump } = useApp();
  const isNew = id === 'nueva';
  const [acc, setAcc] = useState<Partial<Account>>({ kind: 'savings', currency: 'CRC', emoji: '🐷', name: '', institution: '', color: 'graphite', brand: null });
  const [spaceId, setSpaceId] = useState(space?.id || '');
  const [balance, setBalance] = useState('');
  // credit cards: what's owed today in each currency, and the early payments plan (TAR-05)
  const [owedCrcIn, setOwedCrcIn] = useState('');
  const [owedUsdIn, setOwedUsdIn] = useState('');
  const [limitIn, setLimitIn] = useState('');
  const [early, setEarly] = useState<Recurring | null>(null);
  const [plan, setPlan] = useState<{ freq: 'none' | 'weekly' | 'biweekly' | 'monthly'; day: number; from: string }>({ freq: 'none', day: 5, from: '' });
  const [busy, setBusy] = useState(false);
  const { accounts: allAccs } = useApp();

  useEffect(() => {
    if (isNew) return;
    db.from<Account>('accounts').eq('id', id).then((r) => {
      if (r[0]) {
        setAcc(r[0]);
        setSpaceId(r[0].space_id);
        if (r[0].credit_limit != null) setLimitIn(String(Number(r[0].credit_limit)).replace('.', ','));
      }
    });
    db.from<Recurring>('recurring').eq('to_account_id', id).eq('purpose', 'card_early').eq('active', true).limit(1).then((r) => {
      const x = r[0];
      if (!x) return;
      setEarly(x);
      const d = new Date(`${x.next_due}T00:00:00Z`);
      const freq = x.frequency === 'weekly' || x.frequency === 'biweekly' || x.frequency === 'monthly' ? x.frequency : 'weekly';
      setPlan({ freq, day: freq === 'monthly' ? d.getUTCDate() : d.getUTCDay(), from: x.account_id || '' });
    }, () => undefined);
  }, [id, isNew]);

  // debit and savings accounts can have a debit card; credit cards always do (CTA-15)
  const hasCard = acc.kind === 'credit_card' || acc.kind === 'debit' || acc.kind === 'savings';
  async function save() {
    if (!acc.name?.trim()) return;
    setBusy(true);
    const row = {
      space_id: spaceId,
      name: acc.name.trim(),
      institution: acc.institution?.trim() || null,
      kind: acc.kind,
      currency: acc.currency,
      last4: hasCard ? acc.last4?.trim() || null : null,
      emoji: acc.emoji || KIND_EMOJI[acc.kind || 'other'],
      color: acc.color || 'graphite',
      brand: hasCard ? acc.brand || null : null,
      track_balance: acc.track_balance !== false,
      ...(acc.kind === 'credit_card'
        ? { statement_day: acc.parent_account_id ? null : acc.statement_day || null, due_day: acc.parent_account_id ? null : acc.due_day || null,
            credit_limit: acc.parent_account_id || !limitIn.trim() ? null : parseAmount(limitIn), parent_account_id: acc.parent_account_id || null }
        : { statement_day: null, due_day: null, credit_limit: null, parent_account_id: null }),
    };
    try {
      let accountId = id;
      if (isNew) {
        const [c] = await db.insert<Account>('accounts', row);
        accountId = c.id;
      } else await db.update('accounts', { id }, row);
      const isMainCard = acc.kind === 'credit_card' && !acc.parent_account_id;
      if (isMainCard && (owedCrcIn.trim() || owedUsdIn.trim())) {
        // what the card owes today, as the bank says: the new starting point (TAR-02)
        await db.upsert('balance_snapshots', [{ account_id: accountId, balance: parseAmount(owedCrcIn || '0'), balance_usd: parseAmount(owedUsdIn || '0'), taken_on: new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10), created_at: new Date().toISOString() }], 'account_id,taken_on');
      }
      if (isMainCard) await saveEarlyPlan(accountId);
      else if (early) await db.update('recurring', { id: early.id }, { active: false });
      if (acc.kind !== 'credit_card' && balance.trim()) {
        await db.upsert('balance_snapshots', [{ account_id: accountId, balance: parseAmount(balance), taken_on: new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10), created_at: new Date().toISOString() }], 'account_id,taken_on');
      }
      await reloadMeta();
      bump();
      toast('Cuenta guardada');
      history.back();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  /** Early payments: a manual recurring "Mover dinero" to the card, every week, two weeks or month (TAR-05). */
  async function saveEarlyPlan(cardId: string) {
    if (plan.freq === 'none') {
      if (early) await db.update('recurring', { id: early.id }, { active: false });
      return;
    }
    const today = new Date(Date.now() - 6 * 3600000);
    let next: string;
    if (plan.freq === 'monthly') {
      const y = today.getUTCFullYear(), m = today.getUTCMonth();
      const day = (mm: number) => Math.min(plan.day, new Date(Date.UTC(y, mm + 1, 0)).getUTCDate());
      const thisMonth = new Date(Date.UTC(y, m, day(m)));
      next = (thisMonth.getTime() >= Date.UTC(y, m, today.getUTCDate()) ? thisMonth : new Date(Date.UTC(y, m + 1, day(m + 1)))).toISOString().slice(0, 10);
    } else {
      const back = (plan.day - today.getUTCDay() + 7) % 7;
      next = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + back)).toISOString().slice(0, 10);
    }
    // keep the schedule if nothing about it changed (it may be pending right now)
    const same = early && early.frequency === plan.freq && (plan.freq === 'monthly' ? new Date(`${early.next_due}T00:00:00Z`).getUTCDate() === plan.day : new Date(`${early.next_due}T00:00:00Z`).getUTCDay() === plan.day);
    const row = {
      space_id: spaceId, kind: 'transfer', currency: 'CRC', account_id: plan.from || null, to_account_id: cardId, merchant: 'Pago anticipado',
      frequency: plan.freq, method: 'transfer', auto: false, variable: true, purpose: 'card_early', active: true,
      day_of_month: Math.min(plan.freq === 'monthly' ? plan.day : 1, 28),
      ...(same ? {} : { next_due: next, snooze_until: null }),
    };
    if (early) await db.update('recurring', { id: early.id }, row);
    else await db.insert('recurring', { ...row, amount: 1, next_due: next });
  }

  async function archive() {
    await db.update('accounts', { id }, { archived: true });
    await reloadMeta();
    bump();
    toast('Cuenta archivada');
    history.back();
  }

  const set = (k: keyof Account, v: unknown) => setAcc((a) => ({ ...a, [k]: v }));
  // the space's Efectivo always exists: it can be renamed and keep a balance or not, nothing else
  const isCash = acc.system === 'cash';
  return (
    <div className="page no-nav">
      <PageHeader title={isNew ? 'Nueva cuenta' : 'Editar cuenta'} onBack={navigateBack} />
      <div className="page-body">
      <ListGroup title="Así se ve en Cuentas">
        <ListRow
          leading={<ListRow.Icon name={accountIcon(acc).name} color={accountIcon(acc).color} />}
          title={acc.name || 'Nombre de la cuenta'}
          detail={[acc.kind === 'credit_card' ? 'USD/CRC' : acc.currency || 'CRC', KIND_SHORT[acc.kind || 'other'] || '', acc.last4 ? `**${acc.last4}` : '', acc.brand && (acc.kind === 'credit_card' || acc.kind === 'debit') ? BRANDS[acc.brand] : '']}
        />
      </ListGroup>
      <div className="card pad col gap14">
        <span className="field-label">Color</span>
        <div className="swatches left-swatches" role="radiogroup" aria-label="Color de la tarjeta">
          {Object.entries(ACCOUNT_COLORS).map(([k, c]) => (
            <button key={k} role="radio" aria-checked={(acc.color || 'graphite') === k} aria-label={c.label} className={(acc.color || 'graphite') === k ? 'swatch on' : 'swatch'} style={{ background: c.bg }} onClick={() => set('color', k)} />
          ))}
        </div>
        {hasCard && (
          <>
            <span className="field-label">Marca</span>
            <div className="grid4">
              {([[null, 'Ninguna'], ['amex', 'Amex'], ['visa', 'Visa'], ['mastercard', 'Mastercard']] as const).map(([k, l]) => (
                <button key={l} className={(acc.brand || null) === k ? 'opt on' : 'opt'} aria-pressed={(acc.brand || null) === k} onClick={() => set('brand', k)}>{l}</button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="card pad col gap14">
        <label className="col gap6"><span className="field-label">Nombre</span><input className="input" value={acc.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="Ej. Ahorro colones" /></label>
        <label className="col gap6"><span className="field-label">Institución</span><input className="input" value={acc.institution || ''} onChange={(e) => set('institution', e.target.value)} placeholder="Ej. BAC, Banco Nacional, Hapi" /></label>
        {isCash ? (
          <div className="txf-toggle" onClick={(e) => !(e.target as Element).closest('.ds-switch') && set('track_balance', acc.track_balance === false)}>
            <span className="col gap2"><span>Llevar saldo</span><span className="hint">Apagado, los gastos en efectivo cuentan en el mes pero la cuenta no muestra saldo ni suma al patrimonio.</span></span>
            <Switch checked={acc.track_balance !== false} label="Llevar saldo" onChange={(v) => set('track_balance', v)} />
          </div>
        ) : (
          <label className="col gap6"><span className="field-label">Tipo</span>
            <select className="input" value={acc.kind} onChange={(e) => { set('kind', e.target.value); set('emoji', KIND_EMOJI[e.target.value]); }}>
              {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            {KIND_HINT[acc.kind || 'other'] && <span className="hint">{KIND_HINT[acc.kind || 'other']}</span>}
          </label>
        )}
        {isCash ? null : acc.kind === 'credit_card' ? (
          <span className="hint">Las tarjetas aceptan cargos en colones y en dólares. Se muestran por separado.</span>
        ) : (
          <div className="grid2">
            {(['CRC', 'USD'] as const).map((c) => (
              <button key={c} className={acc.currency === c ? 'opt on' : 'opt'} aria-pressed={acc.currency === c} onClick={() => set('currency', c)}>{c === 'CRC' ? '¢ Colones' : '$ Dólares'}</button>
            ))}
          </div>
        )}
        {hasCard && (
          <label className="col gap6"><span className="field-label">{acc.kind === 'credit_card' ? 'Últimos 4 dígitos' : 'Últimos 4 de la tarjeta de débito (opcional)'}</span><input className="input" inputMode="numeric" maxLength={4} value={acc.last4 || ''} onChange={(e) => set('last4', e.target.value.replace(/\D/g, ''))} placeholder="7731" /><span className="hint">Con esto los vouchers del correo caen en esta cuenta y este espacio.</span></label>
        )}
        {acc.kind === 'credit_card' && (() => {
          const mains = allAccs.filter((x) => x.kind === 'credit_card' && !x.parent_account_id && !x.archived && x.id !== id && x.space_id === spaceId);
          const days = Array.from({ length: 31 }, (_, i) => i + 1);
          const senders = allAccs.filter((x) => !x.archived && x.space_id === spaceId && x.kind !== 'credit_card' && x.kind !== 'loan' && x.kind !== 'cdp' && x.kind !== 'investment');
          return (
            <>
              <label className="col gap6"><span className="field-label">Tarjeta adicional de</span>
                <select className="input" value={acc.parent_account_id || ''} onChange={(e) => set('parent_account_id', e.target.value || null)}>
                  <option value="">Ninguna: es una tarjeta principal</option>
                  {mains.map((x) => <option key={x.id} value={x.id}>{x.name}{x.last4 ? ` ••${x.last4}` : ''}</option>)}
                </select>
                <span className="hint">Una adicional (extensión) comparte el saldo, el corte y el límite de la principal: lo que se carga en ella se paga en la principal.</span>
              </label>
              {!acc.parent_account_id && (
                <>
                  <div className="grid2">
                    <label className="col gap6"><span className="field-label">Día de corte</span>
                      <select className="input" value={acc.statement_day || ''} onChange={(e) => set('statement_day', e.target.value ? Number(e.target.value) : null)}>
                        <option value="">Sin definir</option>
                        {days.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </label>
                    <label className="col gap6"><span className="field-label">Fecha máxima de pago</span>
                      <select className="input" value={acc.due_day || ''} onChange={(e) => set('due_day', e.target.value ? Number(e.target.value) : null)}>
                        <option value="">Sin definir</option>
                        {days.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </label>
                  </div>
                  <span className="hint">Están en el estado de cuenta. Si el pago cae antes del día de corte, es el del mes siguiente.</span>
                  <label className="col gap6"><span className="field-label">Límite de crédito (opcional)</span>
                    <input className="input" inputMode="decimal" value={limitIn} onChange={(e) => setLimitIn(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="0" />
                  </label>
                  <div className="grid2">
                    {(['CRC', 'USD'] as const).map((c) => (
                      <button key={c} className={acc.currency === c ? 'opt on' : 'opt'} aria-pressed={acc.currency === c} onClick={() => set('currency', c)}>{c === 'CRC' ? 'Límite en colones' : 'Límite en dólares'}</button>
                    ))}
                  </div>
                  <span className="field-label">Lo que debés hoy (opcional)</span>
                  <div className="grid2">
                    <input className="input" inputMode="decimal" aria-label="Lo que debés en colones" value={owedCrcIn} onChange={(e) => setOwedCrcIn(e.target.value.replace(/[^0-9.,-]/g, ''))} placeholder="¢ colones" />
                    <input className="input" inputMode="decimal" aria-label="Lo que debés en dólares" value={owedUsdIn} onChange={(e) => setOwedUsdIn(e.target.value.replace(/[^0-9.,-]/g, ''))} placeholder="$ dólares" />
                  </div>
                  <span className="hint">Lo que dice el banco hoy. Desde aquí, los cargos suman y los pagos restan.</span>
                  <label className="col gap6"><span className="field-label">Pagos anticipados</span>
                    <select className="input" value={plan.freq} onChange={(e) => setPlan((p) => ({ ...p, freq: e.target.value as typeof p.freq, day: e.target.value === 'monthly' ? 15 : p.freq === 'monthly' ? 5 : p.day }))}>
                      <option value="none">No</option>
                      <option value="weekly">Cada semana</option>
                      <option value="biweekly">Cada dos semanas</option>
                      <option value="monthly">Cada mes</option>
                    </select>
                    <span className="hint">Pagar antes del corte lo que se va cargando. Te recuerda el día y vos registrás cuánto pagaste.</span>
                  </label>
                  {plan.freq !== 'none' && (
                    <div className="grid2">
                      <label className="col gap6"><span className="field-label">{plan.freq === 'monthly' ? 'El día' : 'Los'}</span>
                        <select className="input" value={plan.day} onChange={(e) => setPlan((p) => ({ ...p, day: Number(e.target.value) }))}>
                          {plan.freq === 'monthly'
                            ? days.map((d) => <option key={d} value={d}>{d}</option>)
                            : ['Domingos', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábados'].map((l, i) => <option key={i} value={i}>{l}</option>)}
                        </select>
                      </label>
                      <label className="col gap6"><span className="field-label">Desde</span>
                        <select className="input" value={plan.from} onChange={(e) => setPlan((p) => ({ ...p, from: e.target.value }))}>
                          <option value="">Elegir al pagar</option>
                          {senders.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
                      </label>
                    </div>
                  )}
                </>
              )}
            </>
          );
        })()}
        <label className="col gap6"><span className="field-label">Emoji</span><input className="input" value={acc.emoji || ''} onChange={(e) => set('emoji', e.target.value)} maxLength={8} /></label>
        {!isCash && (
          <label className="col gap6"><span className="field-label">Espacio</span>
            <select className="input" value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
              {spaces.map((s) => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}
            </select>
          </label>
        )}
        {acc.kind !== 'credit_card' && acc.track_balance !== false && (
          <label className="col gap6"><span className="field-label">Saldo de hoy (opcional)</span><input className="input" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value.replace(/[^0-9.,-]/g, ''))} placeholder="0" /></label>
        )}
      </div>
      </div>
      {!isNew && !isCash && (
        <div className="page-actions">
          <Button variant="ghost" size="md" block onClick={archive}>Archivar cuenta</Button>
        </div>
      )}
      <ActionBar>
        <Button variant="primary" size="lg" block onClick={save} disabled={busy || !acc.name?.trim()}>{busy ? 'Guardando…' : 'Guardar'}</Button>
      </ActionBar>
    </div>
  );
}

export function GoalEdit({ id }: { id: string }) {
  const { space, toast, bump, fx } = useApp();
  const isNew = id === 'nueva';
  const w = useNetWorth(space?.id || null);
  const [g, setG] = useState<Partial<Goal>>({ name: '', emoji: '🎯', color: 'butter', currency: 'CRC' });
  const [target, setTarget] = useState('');
  const [linked, setLinked] = useState<string[]>([]);
  useEffect(() => {
    if (isNew) return;
    db.from<Goal>('goals', '*,goal_accounts(account_id)').eq('id', id).then((r) => {
      if (!r[0]) return;
      setG(r[0]);
      setTarget(String(r[0].target_amount));
      setLinked((r[0].goal_accounts || []).map((x) => x.account_id));
    });
  }, [id, isNew]);

  async function save() {
    if (!space || !g.name?.trim() || !parseAmount(target)) return;
    const row = { space_id: space.id, name: g.name.trim(), emoji: g.emoji || '🎯', color: g.color || 'butter', currency: g.currency || 'CRC', target_amount: parseAmount(target) };
    let goalId = id;
    if (isNew) goalId = (await db.insert<Goal>('goals', row))[0].id;
    else await db.update('goals', { id }, row);
    await db.remove('goal_accounts', { goal_id: goalId });
    if (linked.length) await db.insert('goal_accounts', linked.map((account_id) => ({ goal_id: goalId, account_id })));
    bump();
    toast('Meta guardada');
    history.back();
  }
  async function remove() {
    if (!confirm('¿Eliminar esta meta? Las cuentas no se tocan.')) return;
    await db.remove('goals', { id });
    bump();
    history.back();
  }
  const assets = w.accounts.filter((a) => a.kind !== 'credit_card' && a.kind !== 'loan');
  void fx;
  return (
    <div className="page no-nav">
      <PageHeader title={isNew ? 'Nueva meta' : 'Editar meta'} onBack={navigateBack} />
      <div className="page-body">
      <div className="card pad col gap14">
        <label className="col gap6"><span className="field-label">Nombre</span><input className="input" value={g.name || ''} onChange={(e) => setG({ ...g, name: e.target.value })} placeholder="Ej. Casa" /></label>
        <div className="grid2">
          {(['CRC', 'USD'] as const).map((c) => (
            <button key={c} className={g.currency === c ? 'opt on' : 'opt'} onClick={() => setG({ ...g, currency: c })}>{c === 'CRC' ? '¢ Colones' : '$ Dólares'}</button>
          ))}
        </div>
        <label className="col gap6"><span className="field-label">Monto objetivo</span><input className="input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="12.000.000" /></label>
        <div className="swatches">
          {['butter', 'cyan', 'mint', 'lilac', 'pink', 'peach'].map((c) => (
            <button key={c} aria-label={c} aria-pressed={g.color === c} className={g.color === c ? 'swatch on' : 'swatch'} style={{ background: tint(c) }} onClick={() => setG({ ...g, color: c })} />
          ))}
        </div>
      </div>
      <div className="card pad col gap10">
        <span className="field-label">¿Qué cuentas suman a esta meta?</span>
        {assets.length === 0 && <span className="muted">Agregá cuentas en Cuentas primero.</span>}
        {assets.map((a) => (
          <label key={a.id} className="check">
            <input type="checkbox" checked={linked.includes(a.id)} onChange={(e) => setLinked(e.target.checked ? [...linked, a.id] : linked.filter((x) => x !== a.id))} />
            <span>{a.name} {a.institution ? `· ${a.institution}` : ''}</span>
          </label>
        ))}
      </div>
      </div>
      {!isNew && (
        <div className="page-actions">
          <Button variant="ghost" size="md" block className="danger" leading={<Icon name="trash" size={16} />} onClick={remove}>Eliminar meta</Button>
        </div>
      )}
      <ActionBar>
        <Button variant="primary" size="lg" block onClick={save} disabled={!g.name?.trim() || !parseAmount(target)}>Guardar meta</Button>
      </ActionBar>
    </div>
  );
}
