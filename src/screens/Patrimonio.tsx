import { useEffect, useState } from 'react';
import { db } from '../lib/api';
import { cardOutstanding } from '../lib/calc';
import { crIso, money, moneyRaw, monthShort, parseAmount, shortDate, todayCR } from '../lib/format';
import type { Account, Goal, Snapshot, Tx } from '../lib/types';
import { go, useApp } from '../store';
import { BigMoney, Emo, Icon, Loading, Nav, TopBar, tint } from '../ui';

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
        ? await db.from<Tx>('transactions', 'id,kind,amount_crc,account_id,to_account_id,occurred_at').eq('space_id', spaceId).gte('occurred_at', since).limit(3000)
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
  let savings = 0, investments = 0, debts = 0, stale = 0;
  const cardDebt: Record<string, number> = {};
  const now = Date.now();
  for (const a of accounts) {
    if (a.kind === 'credit_card') {
      const owed = cardOutstanding(a, cardTx);
      cardDebt[a.id] = owed;
      debts += owed;
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
    accounts, latest, snaps, cardDebt, assets: savings + investments, savings, investments, debts,
    net: savings + investments - debts, count: tracked, stale, history, loading, reload: () => setTick((x) => x + 1),
  };
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values), min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 320},${6 + (1 - (v - min) / span) * 60}`);
  return (
    <svg role="img" aria-label="Evolución del patrimonio en los últimos 6 meses" width="100%" height="80" viewBox="0 0 320 72" preserveAspectRatio="none">
      <path d={`M${pts.join(' L')} L320,72 L0,72 Z`} fill="#DDF1E2" />
      <polyline points={pts.join(' ')} fill="none" stroke="#111" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Patrimonio() {
  const { space, cur, fx } = useApp();
  const w = useNetWorth(space?.id || null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const { version } = useApp();
  useEffect(() => {
    if (!space) return;
    db.from<Goal>('goals', '*,goal_accounts(account_id)').eq('space_id', space.id).order('created_at').then(setGoals).catch(() => setGoals([]));
  }, [space, version]);

  if (!space) return <Loading />;
  const t = todayCR();
  const prev = w.history[4]?.v ?? 0;
  const delta = w.history[5] && prev ? w.net - prev : 0;
  const byInst = new Map<string, Account[]>();
  w.accounts.forEach((a) => {
    const k = a.kind === 'credit_card' || a.kind === 'loan' ? 'Deudas' : a.institution || 'Otras';
    byInst.set(k, [...(byInst.get(k) || []), a]);
  });
  const groups = [...byInst.entries()].sort((a, b) => (a[0] === 'Deudas' ? 1 : b[0] === 'Deudas' ? -1 : a[0].localeCompare(b[0])));

  return (
    <div className="screen">
      <TopBar />
      <section className="col gap10 px4" aria-label="Patrimonio neto">
        <div className="row between">
          <span className="muted-label">Patrimonio neto</span>
          <span className="date-pill">{space.kind === 'personal' ? '🔒 Solo vos' : `${space.emoji} Compartido`}</span>
        </div>
        <BigMoney crc={w.net} size={56} />
        {delta !== 0 && (
          <span className={delta > 0 ? 'delta-pill up' : 'delta-pill down'}>{delta > 0 ? '↑' : '↓'} {money(Math.abs(delta), cur, fx)} vs. {monthShort((t.m + 11) % 12)}</span>
        )}
      </section>

      <div className="hscroll">
        <div className="bento mint tile"><span className="bento-title sm"><span>🏦</span>Ahorro</span><span className="bento-num sm">{money(w.savings, cur, fx)}</span></div>
        <div className="bento lilac tile"><span className="bento-title sm"><span>📈</span>Inversión</span><span className="bento-num sm">{money(w.investments, cur, fx)}</span></div>
        <div className="bento pink tile"><span className="bento-title sm"><span>💳</span>Deudas</span><span className="bento-num sm">{money(w.debts, cur, fx)}</span></div>
      </div>

      <div className="hscroll">
        <a className="action dark" href="#/saldos"><span>🔄</span>Actualizar saldos</a>
        <a className="action" href="#/cuenta/nueva"><span>🏦</span>Agregar cuenta</a>
        <a className="action" href="#/meta/nueva"><span>🎯</span>Nueva meta</a>
      </div>

      {w.history.some((h) => h.v !== 0) && (
        <section className="card pad col gap10">
          <div className="row between"><h2 className="h3">Evolución</h2><span className="muted small">Últimos 6 meses</span></div>
          <Sparkline values={w.history.map((h, i) => (i === 5 ? w.net : h.v))} />
          <div className="row between tiny-labels">{w.history.map((h, i) => <span key={i}>{monthShort(h.m)}</span>)}</div>
        </section>
      )}

      <section className="col gap12">
        <h2 className="h2 px4">Metas</h2>
        {goals.length === 0 ? (
          <a className="card empty center" href="#/meta/nueva"><span className="big-emoji">🎯</span><strong>Creá tu primera meta</strong><span>Ej. 🏡 Casa o 🛟 Emergencias, y asociale cuentas.</span></a>
        ) : (
          goals.map((g) => {
            const linked = (g.goal_accounts || []).map((x) => w.accounts.find((a) => a.id === x.account_id)).filter(Boolean) as Account[];
            const saved = linked.reduce((acc, a) => acc + (w.latest[a.id] ? toCrc(Number(w.latest[a.id]!.balance), a, fx) : 0), 0);
            const target = g.currency === 'USD' ? Number(g.target_amount) * fx : Number(g.target_amount);
            const pct = target ? Math.min(100, Math.round((saved / target) * 100)) : 0;
            return (
              <a key={g.id} href={`#/meta/${g.id}`} className="goal" style={{ background: tint(g.color) }}>
                <div className="row between">
                  <span className="bento-title"><span>{g.emoji}</span>{g.name}</span>
                  <span className="badge">{pct}%</span>
                </div>
                <div className="row gap6 baseline wrap"><span className="goal-num">{money(saved, cur, fx)}</span><span className="goal-sub">de {money(target, cur, fx)}</span></div>
                <div className="bar white"><span className="bar-fill" style={{ width: `${pct}%`, background: '#111' }} /></div>
                <span className="goal-sub">🔗 {linked.length ? linked.map((a) => a.name).join(' + ') : 'Sin cuentas asociadas'}</span>
              </a>
            );
          })
        )}
      </section>

      <section className="col gap12">
        <div className="section-head">
          <h2 className="h2">Cuentas</h2>
          <span className="muted small">{w.accounts.length} cuentas</span>
        </div>
        {w.loading && w.accounts.length === 0 ? <Loading /> : w.accounts.length === 0 ? (
          <a className="card empty center" href="#/cuenta/nueva"><span className="big-emoji">🏦</span><strong>Agregá tus cuentas</strong><span>Ahorros, inversiones (Hapi), CDPs y tarjetas.</span></a>
        ) : (
          <div className="card list">
            {groups.map(([inst, accs]) => (
              <div key={inst}>
                <span className="day-label">{inst}</span>
                {accs.map((a) => {
                  const s = w.latest[a.id];
                  const isCard = a.kind === 'credit_card';
                  const stale = !isCard && (!s || Date.now() - new Date(s.taken_on).getTime() > 10 * 86400000);
                  const bal = isCard ? -(w.cardDebt[a.id] || 0) : s ? Number(s.balance) : null;
                  return (
                    <button key={a.id} className="tx-row" onClick={() => go(`/cuenta/${a.id}`)}>
                      <Emo e={a.emoji} color={stale ? 'butter' : isCard || a.kind === 'loan' ? 'pink' : a.kind === 'investment' ? 'lilac' : 'mint'} />
                      <span className="tx-mid">
                        <span className="tx-name">{a.name}{a.last4 ? ` ••${a.last4}` : ''}</span>
                        <span className={stale ? 'tx-cat warn-text' : 'tx-cat'}>
                          {isCard ? 'Lo que se debe desde el último pago' : s ? `${stale ? '⏰ ' : ''}Actualizado ${shortDate(s.taken_on + 'T18:00:00Z')}` : '⏰ Sin saldo registrado'}
                        </span>
                      </span>
                      <span className="tx-amt">
                        <span className={bal !== null && bal < 0 ? 'danger' : ''}>
                          {bal === null ? '—' : isCard ? money(bal, cur, fx) : moneyRaw(bal, a.currency)}
                        </span>
                        {bal !== null && !isCard && a.currency !== cur && <span className="tx-sub">≈ {money(toCrc(bal, a, fx), cur, fx)}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </section>
      <Nav active="worth" />
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
                <span>{a.currency === 'USD' ? '$' : '₡'}</span>
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
  const [acc, setAcc] = useState<Partial<Account>>({ kind: 'savings', currency: 'CRC', emoji: '🐷', name: '', institution: '' });
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
      <div className="card pad col gap14">
        <label className="col gap6"><span className="field-label">Nombre</span><input className="input" value={acc.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="Ej. Ahorro colones" /></label>
        <label className="col gap6"><span className="field-label">Institución</span><input className="input" value={acc.institution || ''} onChange={(e) => set('institution', e.target.value)} placeholder="Ej. BAC, Banco Nacional, Hapi" /></label>
        <label className="col gap6"><span className="field-label">Tipo</span>
          <select className="input" value={acc.kind} onChange={(e) => { set('kind', e.target.value); set('emoji', KIND_EMOJI[e.target.value]); }}>
            {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{KIND_EMOJI[k]} {l}</option>)}
          </select>
        </label>
        <div className="grid2">
          {(['CRC', 'USD'] as const).map((c) => (
            <button key={c} className={acc.currency === c ? 'opt on' : 'opt'} aria-pressed={acc.currency === c} onClick={() => set('currency', c)}>{c === 'CRC' ? '₡ Colones' : '$ Dólares'}</button>
          ))}
        </div>
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
            <button key={c} className={g.currency === c ? 'opt on' : 'opt'} onClick={() => setG({ ...g, currency: c })}>{c === 'CRC' ? '₡ Colones' : '$ Dólares'}</button>
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
        {assets.length === 0 && <span className="muted">Agregá cuentas en Patrimonio primero.</span>}
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
