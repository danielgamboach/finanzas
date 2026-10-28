import { useEffect, useState } from 'react';
import { AccountGroup, AccountRow, BalanceSummary, Button, EmptyState, ListGroup, ListRow, PageHeader, Progress } from '../ds';
import { db } from '../lib/api';
import { cardOutstanding, cardPaidThrough } from '../lib/calc';
import { amount, crIso, money, moneyRaw, parseAmount, shortDate, todayCR, unitOf } from '../lib/format';
import type { Account, Goal, Snapshot, Tx } from '../lib/types';
import { go, navigate, navigateBack, useApp } from '../store';
import { Emo, Icon, Loading, tint } from '../ui';
import { ACCOUNT_COLORS, accountColor, BRANDS, byKind } from '../lib/accounts';
import { MovementsBrowser } from './Movimientos';
import { useDesktop } from '../lib/useDesktop';

const ASSET_KINDS = ['savings', 'investment', 'cdp', 'cash', 'debit', 'other'];
const KIND_LABEL: Record<string, string> = {
  credit_card: 'Tarjeta de crédito', debit: 'Cuenta de débito', savings: 'Ahorro', investment: 'Inversión', cash: 'Efectivo', cdp: 'CDP / plazo', loan: 'Préstamo', other: 'Otra',
};
export const KIND_EMOJI: Record<string, string> = { credit_card: '💳', debit: '🏦', savings: '🐷', investment: '📈', cash: '💵', cdp: '🔒', loan: '🧾', other: '🗂️' };

export interface WorthData {
  accounts: Account[];
  latest: Record<string, Snapshot | undefined>;
  snaps: Snapshot[];
  cardDebt: Record<string, number>;
  cardSplit: Record<string, { CRC: number; USD: number }>;
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

/** What's been charged to a card since it was last paid, split by the currency of each charge. */
function cardByCurrency(card: Account, txs: Tx[], spaceCards: Set<string>) {
  const since = cardPaidThrough(card, txs, spaceCards);
  const out = { CRC: 0, USD: 0 };
  for (const t of txs) {
    if (t.account_id !== card.id || t.occurred_at < since) continue;
    const sign = t.kind === 'expense' && !t.hold ? 1 : t.kind === 'refund' ? -1 : 0;
    out[t.currency === 'USD' ? 'USD' : 'CRC'] += sign * Number(t.amount);
  }
  return out;
}

export function useNetWorth(spaceId: string | null): WorthData {
  const { fx, version } = useApp();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [cardTx, setCardTx] = useState<Tx[]>([]);
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
      const cards = accs.filter((a) => a.kind === 'credit_card').map((a) => a.id);
      const since = new Date(Date.now() - 60 * 86400000).toISOString();
      const ct = cards.length
        ? await db.from<Tx>('transactions', 'id,kind,amount,currency,amount_crc,account_id,to_account_id,occurred_at,hold,external_id').eq('space_id', spaceId).gte('occurred_at', since).limit(3000).then((r) => r.filter((t) => t.hold !== 'void'))
        : [];
      if (!alive) return;
      setAccounts(accs);
      setSnaps(s);
      setCardTx(ct);
      setLoading(false);
    })().catch(() => setLoading(false));
    return () => {
      alive = false;
    };
  }, [spaceId, version, tick]);

  const latest: Record<string, Snapshot | undefined> = {};
  for (const s of snaps) if (!latest[s.account_id]) latest[s.account_id] = s;
  let savings = 0, investments = 0, debts = 0, stale = 0, cards = 0;
  const cardDebt: Record<string, number> = {};
  const cardSplit: Record<string, { CRC: number; USD: number }> = {};
  const now = Date.now();
  const spaceCards = new Set(accounts.filter((a) => a.kind === 'credit_card').map((a) => a.id));
  for (const a of accounts) {
    if (a.kind === 'credit_card') {
      const owed = cardOutstanding(a, cardTx, spaceCards);
      cardDebt[a.id] = owed;
      cardSplit[a.id] = cardByCurrency(a, cardTx, spaceCards);
      debts += owed;
      cards += owed;
      continue;
    }
    const s = latest[a.id];
    const v = s ? toCrc(Number(s.balance), a, fx) : 0;
    if (!s || now - new Date(s.taken_on).getTime() > 10 * 86400000) stale++;
    if (a.kind === 'loan') debts += Math.abs(v);
    else if (a.kind === 'investment') investments += v;
    else if (ASSET_KINDS.includes(a.kind)) savings += v;
  }
  const t = todayCR();
  const history = Array.from({ length: 6 }, (_, i) => {
    const end = crIso(t.y, t.m - 4 + i, 1).slice(0, 10);
    let v = 0;
    for (const a of accounts) {
      if (a.kind === 'credit_card') continue;
      const s = snaps.find((x) => x.account_id === a.id && x.taken_on < end);
      if (!s) continue;
      const c = toCrc(Number(s.balance), a, fx);
      v += a.kind === 'loan' ? -Math.abs(c) : c;
    }
    return { m: (t.m - 5 + i + 12) % 12, v };
  });
  const tracked = accounts.filter((a) => a.kind !== 'credit_card').length;
  return {
    accounts, latest, snaps, cardDebt, cardSplit, cards, assets: savings + investments, savings, investments, debts,
    net: savings + investments - debts, count: tracked, stale, history, loading, reload: () => setTick((x) => x + 1),
  };
}

function cardLine(x?: { CRC: number; USD: number }) {
  if (!x || (Math.abs(x.CRC) < 1 && Math.abs(x.USD) < 0.01)) return 'Al día desde el último pago';
  const parts = [Math.abs(x.CRC) >= 1 ? moneyRaw(x.CRC, 'CRC') : '', Math.abs(x.USD) >= 0.01 ? moneyRaw(x.USD, 'USD') : ''].filter(Boolean);
  return `Por pagar: ${parts.join(' + ')}`;
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
  if (a.kind === 'credit_card') {
    // one figure in the display currency; the split by currency lives in the card's own view
    amt = `${amount(w.cardDebt[a.id] || 0, cur, fx)} ${unitOf(cur)}`;
  } else {
    const s = w.latest[a.id];
    if (!s) {
      amt = 'Sin saldo';
      muted = true;
    } else {
      amt = `${amount(Number(s.balance), a.currency, 1, { decimals: false })} ${a.currency}`;
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
  return { main: s ? moneyRaw(Number(s.balance), a.currency) : 'Sin saldo', sub: s ? `Saldo · ${shortDate(s.taken_on + 'T18:00:00Z')}` : 'Agregá el saldo', stale };
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
          <span className="wc-sub">{f.stale && a.kind !== 'credit_card' ? '⏰ ' : ''}{f.sub}</span>
          <span className="wc-amt">{f.main}</span>
        </span>
        {a.brand ? <span className="wc-brand">{BRANDS[a.brand]}</span> : <span className="wc-kind" aria-hidden="true">{a.emoji}</span>}
      </span>
    </Tag>
  );
}

/** Accounts as a wallet: the panel to the right of home. */
export function Cuentas() {
  const { space, cur, fx } = useApp();
  const w = useNetWorth(space?.id || null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const { version } = useApp();
  useEffect(() => {
    if (!space) return;
    db.from<Goal>('goals', '*,goal_accounts(account_id)').eq('space_id', space.id).order('created_at').then(setGoals).catch(() => setGoals([]));
  }, [space, version]);

  const desk = useDesktop();
  if (!space) return <Loading />;
  const accs = [...w.accounts].sort(byKind);
  const hasAssets = accs.some((a) => a.kind !== 'credit_card');

  const groups = w.loading && accs.length === 0 ? (
    <Loading />
  ) : accs.length === 0 ? (
    <EmptyState icon="💳" title="Agregá tus cuentas" action={<Button variant="primary" size="sm" href="#/cuenta/nueva" leading={<Icon name="plus" size={16} solid />}>Nueva cuenta</Button>}>
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
  const goalList = (
    <ListGroup title="Metas" action={<a href="#/meta/nueva">Nueva</a>}>
      {goals.length === 0 ? (
        <ListRow leading={<Emo e="🎯" color="butter" size={40} />} title="Creá tu primera meta" detail="Ej. 🏡 Casa, con las cuentas que suman" chevron href="#/meta/nueva" />
      ) : (
        goals.map((gl) => {
          const linked = (gl.goal_accounts || []).map((x) => w.accounts.find((a) => a.id === x.account_id)).filter(Boolean) as Account[];
          const saved = linked.reduce((acc, a) => acc + (w.latest[a.id] ? toCrc(Number(w.latest[a.id]!.balance), a, fx) : 0), 0);
          const target = gl.currency === 'USD' ? Number(gl.target_amount) * fx : Number(gl.target_amount);
          const pct = target ? Math.min(100, Math.round((saved / target) * 100)) : 0;
          return (
            <ListRow
              key={gl.id}
              leading={<Emo e={gl.emoji || '🎯'} color={gl.color || 'butter'} size={40} />}
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
      <PageHeader title="Cuentas" actions={<Button variant="secondary" size="xs" iconOnly href="#/cuenta/nueva" aria-label="Agregar cuenta"><Icon name="plus" size={16} solid /></Button>} />
      {worth && <div className="page-hero">{worth}</div>}
      <div className="page-body">
        {groups}
        {goalList}
      </div>
    </div>
  );
}

/** "Ya la pagué": records a payment to the card so what's owed goes back to zero (with undo). */
function CardPaid({ a, owed, onDone }: { a: Account; owed: number; onDone: () => void }) {
  const { space, accounts, toast, bump } = useApp();
  const [busy, setBusy] = useState(false);
  if (owed <= 0) return null;
  async function paid() {
    if (!space) return;
    setBusy(true);
    try {
      const debit = accounts.find((x) => x.kind === 'debit' && !x.archived && x.space_id === a.space_id);
      const [tx] = await db.insert<Tx>('transactions', {
        space_id: a.space_id, kind: 'transfer', amount: Math.round(owed * 100) / 100, currency: 'CRC', occurred_at: new Date().toISOString(),
        merchant: 'Pago de tarjeta', account_id: debit?.id ?? null, to_account_id: a.id, source: 'system',
      });
      toast(`✅ ${a.name}: pagada`, async () => {
        if (tx?.id) await db.remove('transactions', { id: tx.id });
        onDone();
        bump();
      });
      onDone();
      bump();
    } catch {
      toast('No se pudo registrar el pago');
    } finally {
      setBusy(false);
    }
  }
  return <Button variant="primary" size="xs" leading={<Icon name="check" size={16} />} disabled={busy} onClick={paid}>Ya la pagué</Button>;
}

/** One account: the key number, the action that updates it, and its movements with filters. */
export function AccountView({ id }: { id: string }) {
  const { space, accounts, cur, fx } = useApp();
  const w = useNetWorth(space?.id || null);
  const desk = useDesktop();
  const a = w.accounts.find((x) => x.id === id) || accounts.find((x) => x.id === id);
  if (!a) return <Loading />;
  const isCard = a.kind === 'credit_card';
  const s = w.latest[a.id];
  const details = [KIND_LABEL[a.kind], a.institution, a.last4 ? `**${a.last4}` : ''].filter(Boolean).join(' · ');
  let hero: React.ReactNode;
  if (isCard) {
    const split = w.cardSplit[a.id];
    const both = split && Math.abs(split.CRC) >= 1 && Math.abs(split.USD) >= 0.01;
    hero = (
      <BalanceSummary
        label={(w.cardDebt[a.id] || 0) > 0 ? 'Por pagar' : 'Al día'}
        value={amount(w.cardDebt[a.id] || 0, cur, fx)}
        unit={unitOf(cur)}
        meta={both ? `${moneyRaw(split.CRC, 'CRC')} + ${moneyRaw(split.USD, 'USD')} · ${details}` : details}
        action={<CardPaid a={a} owed={w.cardDebt[a.id] || 0} onDone={w.reload} />}
      />
    );
  } else {
    hero = (
      <BalanceSummary
        label={s ? `Saldo · ${shortDate(s.taken_on + 'T18:00:00Z')}` : 'Sin saldo'}
        value={s ? amount(Number(s.balance), a.currency, 1) : '0'}
        unit={a.currency}
        meta={details}
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
          <div className="dcol dsticky">{hero}</div>
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
  const editable = w.accounts.filter((a) => a.kind !== 'credit_card');

  async function save() {
    setBusy(true);
    const today = new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10);
    const rows = Object.entries(vals)
      .filter(([, v]) => v.trim() !== '')
      .map(([account_id, v]) => ({ account_id, balance: parseAmount(v), taken_on: today }));
    if (rows.length) await db.upsert('balance_snapshots', rows, 'account_id,taken_on');
    bump();
    toast(`✅ ${rows.length} saldo${rows.length === 1 ? '' : 's'} actualizado${rows.length === 1 ? '' : 's'}`);
    setBusy(false);
    history.back();
  }

  return (
    <div className="page no-nav">
      <PageHeader title="Actualizar saldos" onBack={navigateBack} />
      <div className="page-body">
        <p className="page-text">Poné el saldo de hoy de cada cuenta. Dejá en blanco las que no cambiaron.</p>
        {w.loading ? <Loading /> : editable.length === 0 ? (
          <EmptyState icon="🏦" title="Primero agregá una cuenta" action={<Button variant="primary" size="sm" href="#/cuenta/nueva">Nueva cuenta</Button>} />
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
                  detail={last ? `Antes ${moneyRaw(Number(last.balance), a.currency)} · ${shortDate(last.taken_on + 'T18:00:00Z')}` : 'Sin saldo todavía'}
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
      <div className="page-actions">
        <Button variant="primary" size="lg" block onClick={save} disabled={busy || !Object.values(vals).some((v) => v.trim())}>{busy ? 'Guardando…' : 'Guardar saldos'}</Button>
      </div>
    </div>
  );
}

export function AccountEdit({ id }: { id: string }) {
  const { space, spaces, toast, reloadMeta, bump } = useApp();
  const isNew = id === 'nueva';
  const [acc, setAcc] = useState<Partial<Account>>({ kind: 'savings', currency: 'CRC', emoji: '🐷', name: '', institution: '', color: 'graphite', brand: null });
  const [spaceId, setSpaceId] = useState(space?.id || '');
  const [balance, setBalance] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isNew) return;
    db.from<Account>('accounts').eq('id', id).then((r) => {
      if (r[0]) {
        setAcc(r[0]);
        setSpaceId(r[0].space_id);
      }
    });
  }, [id, isNew]);

  async function save() {
    if (!acc.name?.trim()) return;
    setBusy(true);
    const row = {
      space_id: spaceId,
      name: acc.name.trim(),
      institution: acc.institution?.trim() || null,
      kind: acc.kind,
      currency: acc.currency,
      last4: acc.last4?.trim() || null,
      emoji: acc.emoji || KIND_EMOJI[acc.kind || 'other'],
      color: acc.color || 'graphite',
      brand: acc.kind === 'credit_card' || acc.kind === 'debit' ? acc.brand || null : null,
    };
    try {
      let accountId = id;
      if (isNew) {
        const [c] = await db.insert<Account>('accounts', row);
        accountId = c.id;
      } else await db.update('accounts', { id }, row);
      if (balance.trim()) {
        await db.upsert('balance_snapshots', [{ account_id: accountId, balance: parseAmount(balance), taken_on: new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10) }], 'account_id,taken_on');
      }
      await reloadMeta();
      bump();
      toast('✅ Cuenta guardada');
      history.back();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    await db.update('accounts', { id }, { archived: true });
    await reloadMeta();
    bump();
    toast('Cuenta archivada');
    history.back();
  }

  const set = (k: keyof Account, v: unknown) => setAcc((a) => ({ ...a, [k]: v }));
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
        {(acc.kind === 'credit_card' || acc.kind === 'debit') && (
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
        <label className="col gap6"><span className="field-label">Tipo</span>
          <select className="input" value={acc.kind} onChange={(e) => { set('kind', e.target.value); set('emoji', KIND_EMOJI[e.target.value]); }}>
            {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{KIND_EMOJI[k]} {l}</option>)}
          </select>
        </label>
        {acc.kind === 'credit_card' ? (
          <span className="hint">💳 Las tarjetas aceptan cargos en colones y en dólares. Se muestran por separado.</span>
        ) : (
          <div className="grid2">
            {(['CRC', 'USD'] as const).map((c) => (
              <button key={c} className={acc.currency === c ? 'opt on' : 'opt'} aria-pressed={acc.currency === c} onClick={() => set('currency', c)}>{c === 'CRC' ? '¢ Colones' : '$ Dólares'}</button>
            ))}
          </div>
        )}
        {(acc.kind === 'credit_card' || acc.kind === 'debit') && (
          <label className="col gap6"><span className="field-label">Últimos 4 dígitos</span><input className="input" inputMode="numeric" maxLength={4} value={acc.last4 || ''} onChange={(e) => set('last4', e.target.value.replace(/\D/g, ''))} placeholder="7731" /><span className="hint">Con esto los vouchers del correo caen en esta cuenta y este espacio.</span></label>
        )}
        <label className="col gap6"><span className="field-label">Emoji</span><input className="input" value={acc.emoji || ''} onChange={(e) => set('emoji', e.target.value)} maxLength={8} /></label>
        <label className="col gap6"><span className="field-label">Espacio</span>
          <select className="input" value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
            {spaces.map((s) => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}
          </select>
        </label>
        {acc.kind !== 'credit_card' && (
          <label className="col gap6"><span className="field-label">Saldo de hoy (opcional)</span><input className="input" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value.replace(/[^0-9.,-]/g, ''))} placeholder="0" /></label>
        )}
      </div>
      </div>
      <div className="page-actions">
        <Button variant="primary" size="lg" block onClick={save} disabled={busy || !acc.name?.trim()}>{busy ? 'Guardando…' : 'Guardar'}</Button>
        {!isNew && <Button variant="ghost" size="md" block onClick={archive}>Archivar cuenta</Button>}
      </div>
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
    toast('✅ Meta guardada');
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
        <label className="col gap6"><span className="field-label">Emoji</span><input className="input" value={g.emoji || ''} onChange={(e) => setG({ ...g, emoji: e.target.value })} maxLength={8} /></label>
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
            <span>{a.emoji} {a.name} {a.institution ? `· ${a.institution}` : ''}</span>
          </label>
        ))}
      </div>
      </div>
      <div className="page-actions">
        <Button variant="primary" size="lg" block onClick={save} disabled={!g.name?.trim() || !parseAmount(target)}>Guardar meta</Button>
        {!isNew && <Button variant="ghost" size="md" block className="danger" leading={<Icon name="trash" size={16} />} onClick={remove}>Eliminar meta</Button>}
      </div>
    </div>
  );
}
