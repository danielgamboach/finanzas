import { useEffect, useState } from 'react';
import { db } from '../lib/api';
import { cardOutstanding } from '../lib/calc';
import { crIso, money, moneyRaw, parseAmount, shortDate, todayCR } from '../lib/format';
import type { Account, Goal, Snapshot, Tx } from '../lib/types';
import { go, navigate, useApp } from '../store';
import { BackBar, Emo, Icon, Loading, tint } from '../ui';
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

/** What's been charged to a card since its last recorded payment, split by the currency of each charge. */
function cardByCurrency(card: Account, txs: Tx[]) {
  const pays = txs.filter((t) => t.to_account_id === card.id && t.kind === 'transfer').map((t) => t.occurred_at).sort();
  const since = pays[pays.length - 1] || '';
  const out = { CRC: 0, USD: 0 };
  for (const t of txs) {
    if (t.account_id !== card.id || t.occurred_at <= since) continue;
    const sign = t.kind === 'expense' ? 1 : t.kind === 'refund' ? -1 : 0;
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
        ? await db.from<Tx>('transactions', 'id,kind,amount,currency,amount_crc,account_id,to_account_id,occurred_at,hold').eq('space_id', spaceId).gte('occurred_at', since).limit(3000).then((r) => r.filter((t) => t.hold !== 'void'))
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
  for (const a of accounts) {
    if (a.kind === 'credit_card') {
      const owed = cardOutstanding(a, cardTx);
      cardDebt[a.id] = owed;
      cardSplit[a.id] = cardByCurrency(a, cardTx);
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
  { title: 'Crédito', kinds: ['credit_card'] },
  { title: 'Débito y ahorro', kinds: ['debit', 'savings', 'cash', 'cdp', 'other'] },
  { title: 'Inversión', kinds: ['investment'] },
  { title: 'Préstamos', kinds: ['loan'] },
];

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
    <a className="card empty center" href="#/cuenta/nueva"><span className="big-emoji">💳</span><strong>Agregá tus cuentas</strong><span>Tarjetas, ahorros, inversiones.</span></a>
  ) : (
    GROUPS.map((g) => {
      const list = accs.filter((a) => g.kinds.includes(a.kind));
      if (!list.length) return null;
      return (
        <section key={g.title} className="col gap10">
          <h2 className="h2 px4">{g.title}</h2>
          <div className={desk ? 'wgrid' : 'wstack'}>
            {list.map((a, i) => (
              <AccountCard key={a.id} a={a} w={w} onClick={() => navigate(`/cuenta/${a.id}`)} style={desk ? undefined : { zIndex: i }} />
            ))}
          </div>
        </section>
      );
    })
  );
  const goalList = goals.length === 0 ? (
    <a className="card empty center" href="#/meta/nueva"><span className="big-emoji">🎯</span><strong>Creá tu primera meta</strong><span>Ej. 🏡 Casa, y asociale cuentas.</span></a>
  ) : (
    goals.map((gl) => {
      const linked = (gl.goal_accounts || []).map((x) => w.accounts.find((a) => a.id === x.account_id)).filter(Boolean) as Account[];
      const saved = linked.reduce((acc, a) => acc + (w.latest[a.id] ? toCrc(Number(w.latest[a.id]!.balance), a, fx) : 0), 0);
      const target = gl.currency === 'USD' ? Number(gl.target_amount) * fx : Number(gl.target_amount);
      const pct = target ? Math.min(100, Math.round((saved / target) * 100)) : 0;
      return (
        <a key={gl.id} href={`#/meta/${gl.id}`} className="card pad col gap8 goal-row">
          <div className="row between">
            <strong className="sm">{gl.emoji} {gl.name}</strong>
            <span className="muted small">{pct}%</span>
          </div>
          <div className="bar"><span className="bar-fill" style={{ width: `${pct}%`, background: 'var(--primary)' }} /></div>
          <span className="muted small">{money(saved, cur, fx)} de {money(target, cur, fx)}</span>
        </a>
      );
    })
  );

  if (desk) {
    // desktop: cards side by side, net worth and goals in a column on the right
    return (
      <div className="dpage">
        <header className="dpage-head">
          <h1 className="dtitle">Cuentas</h1>
          <div className="row gap8">
            <a className="pill-btn" href="#/saldos"><Icon name="refresh" size={16} />Actualizar saldos{w.stale ? ` · ${w.stale}` : ''}</a>
            <a className="pill-btn light" href="#/cuenta/nueva"><Icon name="plus" size={16} stroke={2.4} />Nueva cuenta</a>
          </div>
        </header>
        <div className="dgrid cuentas-grid">
          <div className="dcol">{groups}</div>
          <aside className="dcol">
            {hasAssets && (
              <section className="card pad col gap4">
                <span className="muted small">Patrimonio neto</span>
                <strong className="stat-hero">{money(w.net, cur, fx)}</strong>
              </section>
            )}
            <div className="section-head">
              <h2 className="h2">Metas</h2>
              <a className="link" href="#/meta/nueva">Nueva</a>
            </div>
            {goalList}
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-inner">
      <header className="panel-head">
        <h1 className="h1">Cuentas</h1>
        <a href="#/cuenta/nueva" className="round" aria-label="Agregar cuenta"><Icon name="plus" size={20} stroke={2.4} /></a>
      </header>

      {hasAssets && (
        <section className="worth-line" aria-label="Patrimonio neto">
          <span className="col">
            <span className="muted small">Patrimonio neto</span>
            <strong className="worth-num">{money(w.net, cur, fx)}</strong>
          </span>
          <a className="pill-btn" href="#/saldos"><Icon name="refresh" size={16} />Saldos{w.stale ? ` · ${w.stale}` : ''}</a>
        </section>
      )}

      {groups}

      <section className="col gap10">
        <div className="section-head">
          <h2 className="h2">Metas</h2>
          <a className="link" href="#/meta/nueva">Nueva</a>
        </div>
        {goalList}
      </section>
    </div>
  );
}

/** One account: its card, the key number and its movements with filters. */
export function AccountView({ id }: { id: string }) {
  const { space, accounts } = useApp();
  const w = useNetWorth(space?.id || null);
  const desk = useDesktop();
  const a = w.accounts.find((x) => x.id === id) || accounts.find((x) => x.id === id);
  if (!a) return <Loading />;
  const isCard = a.kind === 'credit_card';
  // the card already shows what's owed or the balance; only the action to update it stays
  const figures = isCard ? null : (
    <a className="pill-btn acc-update" href="#/saldos"><Icon name="refresh" size={16} />Actualizar saldo</a>
  );
  if (desk) {
    return (
      <div className="dpage">
        <header className="dpage-head">
          <div className="row gap12">
            <a className="round" href="#/cuentas" aria-label="Volver a cuentas"><Icon name="back" /></a>
            <h1 className="dtitle">{a.name}</h1>
          </div>
          <a className="pill-btn" href={`#/cuenta/${a.id}/editar`}><Icon name="pencil" size={16} />Editar cuenta</a>
        </header>
        <div className="dgrid account-grid">
          <div className="dcol dsticky">
            <AccountCard a={a} w={w} big />
            {figures}
          </div>
          <section className="dcard dmov">
            <h2 className="h2 dmov-head">Movimientos</h2>
            <MovementsBrowser accountId={a.id} screen={`acc:${a.id}`} table />
          </section>
        </div>
      </div>
    );
  }
  return (
    <div className="screen no-nav">
      <BackBar right={<a className="round" href={`#/cuenta/${a.id}/editar`} aria-label="Editar cuenta"><Icon name="pencil" /></a>} />
      <AccountCard a={a} w={w} big />
      {figures}
      <h2 className="h2 px4">Movimientos</h2>
      <MovementsBrowser accountId={a.id} screen={`acc:${a.id}`} />
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
    <div className="screen no-nav">
      <header className="topbar">
        <button className="round" onClick={() => history.back()} aria-label="Volver"><Icon name="back" /></button>
        <h1 className="h2">Actualizar saldos</h1>
        <span style={{ width: 48 }} />
      </header>
      <p className="muted px4">Poné el saldo de hoy de cada cuenta. Dejá en blanco las que no cambiaron.</p>
      {w.loading ? <Loading /> : editable.length === 0 ? (
        <a className="card empty center" href="#/cuenta/nueva"><strong>Primero agregá una cuenta</strong></a>
      ) : (
        <div className="card list">
          {editable.map((a) => (
            <label key={a.id} className="saldo-row">
              <Emo e={a.emoji} color="mint" size={44} />
              <span className="grow col">
                <strong className="sm">{a.name}</strong>
                <span className="muted small">{a.institution || KIND_LABEL[a.kind]} · antes {w.latest[a.id] ? moneyRaw(Number(w.latest[a.id]!.balance), a.currency) : '—'}</span>
              </span>
              <span className="saldo-input">
                <span>{a.currency === 'USD' ? '$' : '¢'}</span>
                <input inputMode="decimal" value={vals[a.id] || ''} onChange={(e) => setVals({ ...vals, [a.id]: e.target.value.replace(/[^0-9.,-]/g, '') })} placeholder="0" aria-label={`Saldo de ${a.name}`} />
              </span>
            </label>
          ))}
        </div>
      )}
      <button className="btn-dark big" onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Guardar saldos'}</button>
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
    <div className="screen no-nav">
      <header className="topbar">
        <button className="round" onClick={() => history.back()} aria-label="Volver"><Icon name="back" /></button>
        <h1 className="h2">{isNew ? 'Nueva cuenta' : 'Editar cuenta'}</h1>
        <span style={{ width: 48 }} />
      </header>
      <div className="wcard big preview" style={{ background: accountColor(acc).bg, color: accountColor(acc).fg }} aria-hidden="true">
        <span className="wc-top">
          <span className="wc-name">{acc.name || 'Nombre de la cuenta'}</span>
          <span className="wc-num">{acc.last4 ? `••••${acc.last4}` : acc.institution || ''}</span>
        </span>
        <span className="wc-bottom">
          <span className="wc-sub">{KIND_LABEL[acc.kind || 'other']}</span>
          {acc.brand && (acc.kind === 'credit_card' || acc.kind === 'debit') ? <span className="wc-brand">{BRANDS[acc.brand]}</span> : <span className="wc-kind">{acc.emoji}</span>}
        </span>
      </div>
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
      <button className="btn-dark big" onClick={save} disabled={busy || !acc.name?.trim()}>{busy ? 'Guardando…' : 'Guardar'}</button>
      {!isNew && <button className="btn-light" onClick={archive}>🗄️ Archivar cuenta</button>}
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
    <div className="screen no-nav">
      <header className="topbar">
        <button className="round" onClick={() => history.back()} aria-label="Volver"><Icon name="back" /></button>
        <h1 className="h2">{isNew ? 'Nueva meta' : 'Editar meta'}</h1>
        <span style={{ width: 48 }} />
      </header>
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
      <button className="btn-dark big" onClick={save}>Guardar meta</button>
      {!isNew && <button className="btn-danger" onClick={remove}><Icon name="trash" size={18} /> Eliminar meta</button>}
    </div>
  );
}
