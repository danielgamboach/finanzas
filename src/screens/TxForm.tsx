import { useEffect, useMemo, useState } from 'react';
import { db } from '../lib/api';
import { extractTags, tagsOf } from '../lib/calc';
import { fromInputDateTime, moneyRaw, parseAmount, todayCR, toInputDateTime } from '../lib/format';
import type { Account, Category, Currency, Tx, TxKind } from '../lib/types';
import { go, TX_SELECT, useApp } from '../store';
import { Icon, Loading, Segmented, tint } from '../ui';

type FormType = 'gasto' | 'ingreso' | 'transferir' | 'aporte';
const TYPE_TO_KIND: Record<FormType, TxKind> = { gasto: 'expense', ingreso: 'income', transferir: 'transfer', aporte: 'contribution' };
const KIND_TO_TYPE: Record<string, FormType> = { expense: 'gasto', refund: 'gasto', income: 'ingreso', transfer: 'transferir', contribution: 'aporte' };

// typing keeps digits and one decimal comma; the field shows thousands with dots
function rawAmount(v: string) {
  const clean = v.replace(/\./g, '').replace(/[^0-9,]/g, '');
  const [i, ...rest] = clean.split(',');
  return rest.length ? `${i},${rest.join('').slice(0, 2)}` : i;
}
function displayAmount(raw: string) {
  const [i, d] = raw.split(',');
  const int = (i || '').replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return d !== undefined ? `${int || '0'},${d}` : int;
}

function rulePattern(raw: string) {
  return raw
    .toUpperCase()
    .replace(/HTTPS?:\/\/\S+/g, '')
    .replace(/\s+(SAN JOSE|HEREDIA|ESCAZU|CARTAGO|ALAJUELA|COSTA RICA)\b.*$/, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join(' ')
    .trim();
}

export function TxForm({ id }: { id?: string }) {
  const app = useApp();
  const { spaces, members, profiles, userId, fx, toast, bump } = app;
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const [loadingTx, setLoadingTx] = useState(Boolean(id));
  const [orig, setOrig] = useState<Tx | null>(null);

  const [type, setType] = useState<FormType>((params.get('tipo') as FormType) || 'gasto');
  const [spaceId, setSpaceId] = useState<string>(app.space?.id || spaces[0]?.id || '');
  const [cur, setCur] = useState<Currency>('CRC');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [contributor, setContributor] = useState<string>(userId);
  const [merchant, setMerchant] = useState('');
  const [when, setWhen] = useState(toInputDateTime(new Date().toISOString()));
  const [note, setNote] = useState('');
  const [repeat, setRepeat] = useState(false);
  const [remember, setRemember] = useState(true);
  const [showAllCats, setShowAllCats] = useState(false);
  const [cats, setCats] = useState<Category[]>([]);
  const [accs, setAccs] = useState<Account[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // load the transaction when editing
  useEffect(() => {
    if (!id) return;
    db.from<Tx>('transactions', TX_SELECT).eq('id', id).then((rows) => {
      const t = rows[0];
      if (!t) return go('/movimientos');
      setOrig(t);
      setType(KIND_TO_TYPE[t.kind] || 'gasto');
      setSpaceId(t.space_id);
      setCur(t.currency);
      setAmount(rawAmount(String(t.amount).replace('.', ',')));
      setCategoryId(t.category_id);
      setAccountId(t.account_id);
      setToAccountId(t.to_account_id);
      setContributor(t.contributor_id || userId);
      setMerchant(t.merchant || '');
      setWhen(toInputDateTime(t.occurred_at));
      const tg = tagsOf(t);
      const base = (t.note || '').replace(/#[\p{L}\p{N}_-]+/gu, '').trim();
      setNote([base, ...tg].filter(Boolean).join(' '));
      setLoadingTx(false);
    });
  }, [id, userId]);

  // categories and accounts for the selected space
  useEffect(() => {
    if (!spaceId) return;
    Promise.all([
      db.from<Category>('categories').eq('space_id', spaceId).eq('archived', false).order('sort'),
      db.from<Account>('accounts').eq('space_id', spaceId).eq('archived', false).order('created_at'),
    ]).then(([c, a]) => {
      setCats(c);
      setAccs(a);
    });
  }, [spaceId]);

  const space = spaces.find((s) => s.id === spaceId);
  const sharedSpaces = spaces.filter((s) => s.kind === 'shared');
  useEffect(() => {
    if (type === 'aporte' && space?.kind !== 'shared' && sharedSpaces[0]) setSpaceId(sharedSpaces[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const kind = TYPE_TO_KIND[type];
  const catKind = type === 'ingreso' ? 'income' : 'expense';
  const visibleCats = cats.filter((c) => c.kind === catKind);
  const shownCats = showAllCats ? visibleCats : visibleCats.slice(0, 8);
  const num = parseAmount(amount);
  const eq = cur === 'USD' ? moneyRaw(num * fx, 'CRC') : moneyRaw(num / fx, 'USD');
  const spaceMembers = members.filter((m) => m.space_id === spaceId);
  const selectedCat = cats.find((c) => c.id === categoryId);
  const fromEmail = orig && (orig.source === 'email' || orig.source === 'import') && orig.raw_merchant;
  const categoryChanged = orig && categoryId && categoryId !== orig.category_id;

  const canSave = num > 0 && spaceId && (type !== 'transferir' || (accountId || toAccountId));

  async function save() {
    if (!canSave || !space) return;
    setBusy(true);
    setError(null);
    try {
      const tagNames = extractTags(note);
      const cleanNote = note.replace(/#[\p{L}\p{N}_-]+/gu, '').trim() || null;
      const occurred_at = fromInputDateTime(when);
      const fxRate = cur === 'USD' ? (orig && orig.currency === 'USD' ? Number(orig.fx_rate) : fx) : 1;
      const row: Record<string, unknown> = {
        space_id: spaceId,
        kind: orig?.kind === 'refund' && type === 'gasto' ? 'refund' : kind,
        amount: Math.round(num * 100) / 100,
        currency: cur,
        fx_rate: fxRate,
        occurred_at,
        merchant: merchant.trim() || (type === 'aporte' ? `Aporte de ${profiles[contributor]?.name || 'miembro'}` : selectedCat?.name || null),
        note: cleanNote,
        category_id: type === 'gasto' || type === 'ingreso' ? categoryId : null,
        account_id: accountId,
        to_account_id: type === 'transferir' || type === 'aporte' ? toAccountId : null,
        contributor_id: type === 'aporte' ? contributor : null,
        status: (type === 'gasto' || type === 'ingreso') && !categoryId ? 'review' : 'posted',
      };
      let txId = id;
      if (id) {
        await db.update('transactions', { id }, row);
      } else {
        const [created] = await db.insert<Tx>('transactions', { ...row, source: 'manual', created_by: userId });
        txId = created.id;
        if (repeat) {
          const t = todayCR();
          const day = Math.min(new Date(occurred_at).getUTCDate(), 28);
          const [rec] = await db.insert('recurring', {
            space_id: spaceId,
            kind: row.kind,
            amount: row.amount,
            currency: cur,
            category_id: row.category_id,
            account_id: accountId,
            merchant: row.merchant || 'Recurrente',
            day_of_month: day,
            last_generated: `${t.y}-${String(t.m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          });
          await db.update('transactions', { id: txId }, { recurring_id: rec.id });
        }
      }
      // tags
      if (txId) {
        await db.remove('transaction_tags', { transaction_id: txId });
        if (tagNames.length) {
          const tagRows = await db.upsert<{ id: string }>('tags', tagNames.map((name) => ({ space_id: spaceId, name })), 'space_id,name');
          await db.insert('transaction_tags', tagRows.map((t) => ({ transaction_id: txId, tag_id: t.id })));
        }
      }
      // learn the merchant
      let applied = 0;
      if (orig && remember && categoryChanged && fromEmail && orig.raw_merchant) {
        const pattern = rulePattern(orig.raw_merchant);
        if (pattern.length >= 3) applied = await db.rpc<number>('save_rule_and_apply', { p_space: spaceId, p_pattern: pattern, p_category: categoryId });
      }
      toast(applied > 1 ? `✅ Guardado · ${applied} movimientos más categorizados` : '✅ Guardado');
      bump();
      await app.reloadMeta();
      history.length > 1 ? history.back() : go('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!id || !confirm('¿Eliminar este movimiento?')) return;
    await db.remove('transactions', { id });
    toast('Movimiento eliminado');
    bump();
    history.length > 1 ? history.back() : go('/');
  }

  const typeOptions = useMemo<[FormType, string][]>(() => {
    const base: [FormType, string][] = [['gasto', '💸 Gasto'], ['ingreso', '💰 Ingreso'], ['transferir', '🔄 Mover']];
    if (sharedSpaces.length) base.push(['aporte', '🤝 Aporte']);
    return base;
  }, [sharedSpaces.length]);

  if (loadingTx) return <Loading />;

  return (
    <div className="form-screen">
      <div className="sheet-page" role="dialog" aria-label={id ? 'Editar movimiento' : 'Nuevo movimiento'}>
        <div className="grabber" />
        <div className="row between">
          <h1 className="h2">{id ? 'Editar movimiento' : 'Nuevo movimiento'}</h1>
          <button className="round light" onClick={() => (history.length > 1 ? history.back() : go('/'))} aria-label="Cerrar">
            <Icon name="close" size={18} stroke={2.4} />
          </button>
        </div>

        {orig?.raw_merchant && (
          <div className="from-bank">
            <span>🏦</span>
            <span className="col">
              <strong>Del banco: {orig.raw_merchant}</strong>
              <span>{orig.currency} {String(orig.amount)} {orig.currency === 'USD' ? `· tipo de cambio ${Number(orig.fx_rate).toFixed(2)}` : ''}</span>
            </span>
          </div>
        )}

        <Segmented value={type} options={typeOptions} onChange={setType} />

        <div className="amount-block">
          <div className="row gap6">
            {(['CRC', 'USD'] as Currency[]).map((c) => (
              <button key={c} className={cur === c ? 'mini on' : 'mini'} aria-pressed={cur === c} onClick={() => setCur(c)}>
                {c === 'CRC' ? '₡ Colones' : '$ Dólares'}
              </button>
            ))}
          </div>
          <label className="amount-input">
            <span className="sr">Monto</span>
            <span className="amount-sym">{cur === 'USD' ? '$' : '₡'}</span>
            <input
              inputMode="decimal"
              autoFocus={!id}
              placeholder="0"
              value={displayAmount(amount)}
              onChange={(e) => setAmount(rawAmount(e.target.value))}
              className={type === 'ingreso' || type === 'aporte' ? 'pos' : ''}
              style={{ width: `${Math.max(1, displayAmount(amount).length) * 0.62 + 0.3}em` }}
            />
          </label>
          {num > 0 && <span className="muted-label">≈ {eq}</span>}
        </div>

        <div className="grid2">
          {spaces
            .filter((s) => type !== 'aporte' || s.kind === 'shared')
            .map((s) => (
              <button key={s.id} className={s.id === spaceId ? 'opt on' : 'opt'} aria-pressed={s.id === spaceId} onClick={() => { setSpaceId(s.id); setCategoryId(null); setAccountId(null); setToAccountId(null); }}>
                <span>{s.emoji}</span>
                {s.name}
              </button>
            ))}
        </div>

        {(type === 'gasto' || type === 'ingreso') && (
          <div className="col gap10">
            <span className="field-label">Categoría</span>
            <div className="cat-grid">
              {shownCats.map((c) => (
                <button
                  key={c.id}
                  className={c.id === categoryId ? 'cat-tile on' : 'cat-tile'}
                  aria-pressed={c.id === categoryId}
                  style={{ background: tint(c.color, c.id === categoryId) }}
                  onClick={() => setCategoryId(c.id === categoryId ? null : c.id)}
                >
                  <span className="cat-emoji">{c.emoji}</span>
                  {c.name}
                </button>
              ))}
              {visibleCats.length > 8 && !showAllCats && (
                <button className="cat-tile" style={{ background: tint('gray', false) }} onClick={() => setShowAllCats(true)}>
                  <span className="cat-emoji">✨</span>
                  Más
                </button>
              )}
            </div>
            {orig && categoryChanged && fromEmail && (
              <label className="check">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                <span>Recordar: “{rulePattern(orig.raw_merchant || '')}” siempre va en {selectedCat?.emoji} {selectedCat?.name}</span>
              </label>
            )}
          </div>
        )}

        {type === 'aporte' && (
          <div className="col gap10">
            <span className="field-label">¿Quién aporta?</span>
            <div className="grid2">
              {spaceMembers.map((m) => (
                <button key={m.user_id} className={contributor === m.user_id ? 'opt big on' : 'opt big'} aria-pressed={contributor === m.user_id} onClick={() => setContributor(m.user_id)}>
                  <span>{profiles[m.user_id]?.emoji || '🙂'}</span>
                  {profiles[m.user_id]?.name || 'Miembro'}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="field-card">
          <label className="field-row">
            <span>{type === 'aporte' ? 'Detalle' : 'Comercio o detalle'}</span>
            <input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder={type === 'aporte' ? 'Aporte de octubre' : 'Ej. Feria, SINPE a Juan'} />
          </label>
          {type !== 'aporte' && (
            <label className="field-row">
              <span>{type === 'transferir' ? 'Desde' : 'Cuenta'}</span>
              <select value={accountId || ''} onChange={(e) => setAccountId(e.target.value || null)}>
                <option value="">{type === 'transferir' ? 'Elegir…' : '💵 Efectivo / SINPE'}</option>
                {accs.map((a) => (
                  <option key={a.id} value={a.id}>{a.emoji} {a.name}{a.last4 ? ` ••${a.last4}` : ''}</option>
                ))}
              </select>
            </label>
          )}
          {(type === 'transferir' || type === 'aporte') && (
            <label className="field-row">
              <span>Hacia</span>
              <select value={toAccountId || ''} onChange={(e) => setToAccountId(e.target.value || null)}>
                <option value="">Elegir…</option>
                {accs.map((a) => (
                  <option key={a.id} value={a.id}>{a.emoji} {a.name}{a.last4 ? ` ••${a.last4}` : ''}</option>
                ))}
              </select>
            </label>
          )}
          <label className="field-row">
            <span>Fecha</span>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>
          {!id && (
            <div className="field-row">
              <span className="col">
                <span>🔁 Repetir cada mes</span>
                <small>{repeat ? 'Se va a crear solo cada mes' : 'Para alquiler, suscripciones o salario'}</small>
              </span>
              <button role="switch" aria-checked={repeat} aria-label="Repetir cada mes" className={repeat ? 'switch on' : 'switch'} onClick={() => setRepeat((r) => !r)}>
                <span />
              </button>
            </div>
          )}
        </div>
        {type === 'transferir' && <span className="hint">Las transferencias no cuentan como gasto ni ingreso, así el balance no se duplica.</span>}

        <label className="col gap8">
          <span className="field-label">Nota y tags <small>(opcional)</small></span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. compra de la semana #finde" />
        </label>

        {error && <div className="error">{error}</div>}

        <button className="btn-dark big" disabled={!canSave || busy} onClick={save}>
          {busy ? 'Guardando…' : id ? 'Guardar cambios' : { gasto: 'Guardar gasto', ingreso: 'Guardar ingreso', transferir: 'Guardar movimiento', aporte: 'Guardar aporte' }[type]}
          <Icon name="arrowRight" />
        </button>
        {id && (
          <button className="btn-danger" onClick={remove}>
            <Icon name="trash" size={18} /> Eliminar movimiento
          </button>
        )}
      </div>
    </div>
  );
}
