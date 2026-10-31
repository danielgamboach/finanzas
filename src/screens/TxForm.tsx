import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionBar, AmountInput, Avatar, Bone, Button, FormSkeleton, Loader, Menu, MenuItem, SelectPill, Switch } from '../ds';
import { db } from '../lib/api';
import { catLabel, pickerOrder } from '../lib/cats';
import { addPeriod, patternFrom } from '../lib/recurring';
import { useDesktop } from '../lib/useDesktop';
import { MerchantPhotoField } from '../ui/Merchant';
import { MerchantInput } from '../ui/MerchantInput';
import { merchantSiblings, setMerchantCategory } from '../lib/merchantCategory';
import { namePhoto, photoUrl, txMerchant } from '../lib/merchants';
import { extractTags, tagsOf } from '../lib/calc';
import { fromInputDateTime, moneyRaw, parseAmount, toInputDateTime } from '../lib/format';
import type { Account, Category, Currency, Tx, TxKind } from '../lib/types';
import { closeModal, go, TX_SELECT, useApp } from '../store';
import { Icon } from '../ui';

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

const TYPE_META: Record<FormType, { label: string; icon: string; title: string; save: string }> = {
  gasto: { label: 'Gasto', icon: 'arrowUpRight', title: 'Nuevo gasto', save: 'Guardar gasto' },
  ingreso: { label: 'Ingreso', icon: 'arrowDownLeft', title: 'Nuevo ingreso', save: 'Guardar ingreso' },
  transferir: { label: 'Mover', icon: 'exchange', title: 'Mover dinero', save: 'Guardar movimiento' },
  aporte: { label: 'Aporte', icon: 'handUsd', title: 'Nuevo aporte', save: 'Guardar aporte' },
};

const spaceColor = (kind?: string) => (kind === 'shared' ? 'mint' : 'sky');

export function TxForm({ id, autoFocusAmount = !id }: { id?: string; autoFocusAmount?: boolean }) {
  const app = useApp();
  const { spaces, members, profiles, userId, fx, toast, bump } = app;
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const [loadingTx, setLoadingTx] = useState(Boolean(id));
  const [orig, setOrig] = useState<Tx | null>(null);

  const [type, setType] = useState<FormType>((params.get('tipo') as FormType) || 'gasto');
  const [spaceId, setSpaceId] = useState<string>(app.space?.id || spaces[0]?.id || '');
  const [cur, setCur] = useState<Currency>(app.cur || 'CRC');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  // who set the category: a suggested merchant brings its own and the next one replaces it; one chosen by hand stays
  const [catFrom, setCatFrom] = useState<'merchant' | 'user' | null>(null);
  // after a tap on the save (or Continuar) while something is missing, the bar says what
  const [askMissing, setAskMissing] = useState(false);
  // the catalog merchant picked from the suggestions (for its logo); typing again forgets it
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [spaceMenu, setSpaceMenu] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [contributor, setContributor] = useState<string>(userId);
  const [merchant, setMerchant] = useState('');
  const [when, setWhen] = useState(toInputDateTime(new Date().toISOString()));
  const [note, setNote] = useState('');
  const [repeat, setRepeat] = useState(false);
  const [remember, setRemember] = useState(true);
  const [applyAll, setApplyAll] = useState(true);
  const [siblings, setSiblings] = useState(0);
  const [cats, setCats] = useState<Category[]>([]);
  const [accs, setAccs] = useState<Account[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // on the phone the bottom button follows the keyboard: amount → add the merchant, any other field → close the
  // keyboard, nothing focused → save
  const phone = !useDesktop();
  // amount and merchant are the top of the form; while one of them has the keyboard, the rest steps aside
  const [field, setField] = useState<'amount' | 'merchant' | 'text' | null>(null);
  const onFocusIn = (e: React.FocusEvent) => {
    const el = e.target as HTMLElement;
    if (el.closest('.txf-amount')) setField('amount');
    else if (el.closest('.merchant-field')) setField('merchant');
    else if (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !['checkbox', 'radio', 'file', 'date', 'datetime-local'].includes(el.type))) setField('text');
    else setField(null);
  };
  const onFocusOut = () => setField(null);
  // keep the field focused (and the keyboard up) while the bottom button is pressed
  const keep = (e: React.PointerEvent | React.MouseEvent) => e.preventDefault();
  const merchantRef = useRef<HTMLDivElement>(null);
  const toMerchant = () => merchantRef.current?.querySelector<HTMLTextAreaElement>('.merchant-field textarea')?.focus();
  const doneTyping = () => (document.activeElement as HTMLElement | null)?.blur?.();
  // "Continuar" on the amount: on to the merchant, or done if it's already there
  const next = () => (merchant.trim() ? doneTyping() : toMerchant());

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
      setCategoryId(t.category_id || t.suggested_category_id || null);
      setAccountId(t.account_id);
      setToAccountId(t.to_account_id);
      setContributor(t.contributor_id || userId);
      setMerchant(t.merchant || '');
      setWhen(toInputDateTime(t.occurred_at));
      const tg = tagsOf(t);
      const base = (t.note || '').replace(/#[\p{L}\p{N}_-]+/gu, '').trim();
      setNote([base, ...tg].filter(Boolean).join(' '));
      setLoadingTx(false);
      merchantSiblings(t).then((r) => setSiblings(r.length), () => setSiblings(0));
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
  const visibleCats = pickerOrder(cats.filter((c) => c.kind === catKind));
  const num = parseAmount(amount);
  const eq = cur === 'USD' ? moneyRaw(num * fx, 'CRC') : moneyRaw(num / fx, 'USD');
  const spaceMembers = members.filter((m) => m.space_id === spaceId);
  const selectedCat = cats.find((c) => c.id === categoryId);
  const fromEmail = orig && (orig.source === 'email' || orig.source === 'import') && orig.raw_merchant;
  const categoryChanged = orig && categoryId && (categoryId !== orig.category_id || orig.status === 'review');
  // a merchant is one thing: changing its category moves its other movements and branches too
  const sameSpaceAndKind = orig && spaceId === orig.space_id && (type === 'gasto' || type === 'ingreso') && TYPE_TO_KIND[type] === (orig.kind === 'refund' ? 'expense' : orig.kind);
  const canApplyAll = Boolean(categoryChanged && sameSpaceAndKind && siblings > 0 && merchant === orig?.merchant);
  const merchantName = (orig && txMerchant(app.merchants, orig)?.name) || orig?.merchant || 'este comercio';

  const canSave = Boolean(num > 0 && spaceId && (type !== 'transferir' || (accountId || toAccountId)));
  const missing = !(num > 0) ? 'amount' : type === 'transferir' && !accountId && !toAccountId ? 'accounts' : !spaceId ? 'space' : null;
  const MISSING_TEXT = { amount: 'Falta el monto', accounts: 'Elegí de qué cuenta sale o a cuál entra', space: 'Elegí un espacio arriba a la derecha' } as const;
  const shownMissing = missing ? MISSING_TEXT[missing] : null;
  // a tap on the dimmed button: say what's missing and take you there
  const flagMissing = () => {
    setAskMissing(true);
    if (missing === 'amount') document.querySelector<HTMLInputElement>('.txf-amount input')?.focus();
  };
  useEffect(() => {
    if (!missing) setAskMissing(false);
  }, [missing]);

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
      if (id && orig) {
        if (categoryId && (categoryId !== orig.category_id || orig.status === 'review')) row.category_source = 'manual';
        if (categoryId) row.suggested_category_id = null;
      }
      let txId = id;
      if (id) {
        await db.update('transactions', { id }, row);
      } else {
        const [created] = await db.insert<Tx>('transactions', { ...row, source: 'manual', created_by: userId });
        txId = created.id;
        if (repeat) {
          const day = new Date(new Date(occurred_at).getTime() - 6 * 3600000).toISOString().slice(0, 10);
          const acc = accs.find((a) => a.id === accountId);
          const [rec] = await db.insert<{ id: string }>('recurring', {
            space_id: spaceId,
            kind: row.kind,
            amount: row.amount,
            currency: cur,
            category_id: row.category_id,
            account_id: accountId,
            merchant: row.merchant || 'Recurrente',
            frequency: 'monthly',
            next_due: addPeriod(day, 'monthly'),
            method: acc?.kind === 'credit_card' ? 'card' : 'transfer',
            match_pattern: patternFrom(row.merchant) || null,
            last_paid_on: day,
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
      let undo: (() => Promise<unknown>) | undefined;
      if (orig && categoryId && canApplyAll && applyAll) {
        const r = await setMerchantCategory(orig.id, categoryId);
        applied = r.changed;
        if (r.changed) undo = r.undo;
      } else if (orig && !canApplyAll && remember && categoryChanged && fromEmail && orig.raw_merchant) {
        const pattern = rulePattern(orig.raw_merchant);
        if (pattern.length >= 3) applied = await db.rpc<number>('save_rule_and_apply', { p_space: spaceId, p_pattern: pattern, p_category: categoryId });
      }
      const target = cats.find((c) => c.id === categoryId);
      if (undo) toast(`Todo ${merchantName} → ${target?.name || 'categoría'} · ${applied} ${applied === 1 ? 'movimiento más' : 'movimientos más'}`, undo);
      else toast(applied > 1 ? `Guardado · ${applied} movimientos más categorizados` : 'Guardado');
      bump();
      await app.reloadMeta();
      closeModal();
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
    closeModal(true);
  }

  const typeOptions = useMemo<[FormType, string][]>(() => {
    const base: [FormType, string][] = [['gasto', 'Gasto'], ['ingreso', 'Ingreso'], ['transferir', 'Mover']];
    if (sharedSpaces.length) base.push(['aporte', 'Aporte']);
    return base;
  }, [sharedSpaces.length]);

  // the space menu closes with Esc before the form does
  useEffect(() => {
    if (!spaceMenu) return;
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      setSpaceMenu(false);
    };
    addEventListener('keydown', on, true);
    return () => removeEventListener('keydown', on, true);
  }, [spaceMenu]);

  const meta = TYPE_META[type];
  const title = id ? 'Editar movimiento' : meta.title;
  const spaceChoices = spaces.filter((s) => type !== 'aporte' || s.kind === 'shared');
  const pickSpace = (sid: string) => {
    setSpaceMenu(false);
    if (sid === spaceId) return;
    setSpaceId(sid);
    setCategoryId(null);
    setAccountId(null);
    setToAccountId(null);
  };

  const head = (
    <header className="txf-head">
      <Button variant="ghost" size="sm" iconOnly onClick={() => closeModal()} aria-label={phone ? 'Volver' : 'Cerrar'}>
        <Icon name={phone ? 'back' : 'close'} size={16} stroke={phone ? 2 : 2.4} />
      </Button>
      <h1 className="txf-title">{title}</h1>
      <div className="txf-space">
        {space && (
          <button
            type="button"
            className="txf-space-btn"
            onClick={() => setSpaceMenu((o) => !o)}
            disabled={spaceChoices.length < 2}
            aria-haspopup="menu"
            aria-expanded={spaceMenu}
            aria-label={`Espacio: ${space.name}${spaceChoices.length > 1 ? '. Cambiar' : ''}`}
            title={space.name}
          >
            <Avatar emoji={space.emoji} color={spaceColor(space.kind)} size={32} />
          </button>
        )}
        {spaceMenu && (
          <>
            <div className="txf-space-scrim" onClick={() => setSpaceMenu(false)} />
            <Menu className="txf-space-menu" label="Espacio del movimiento">
              {spaceChoices.map((s) => (
                <MenuItem key={s.id} icon={<Avatar emoji={s.emoji} color={spaceColor(s.kind)} size={32} />} selected={s.id === spaceId} onClick={() => pickSpace(s.id)}>
                  {s.name}
                </MenuItem>
              ))}
            </Menu>
          </>
        )}
      </div>
    </header>
  );

  if (loadingTx) {
    return (
      <div className="form-screen">
        <div className="sheet-page tx-form" aria-label="Editar movimiento">
          {head}
          <Loader>
            <div className="txf-main">
              <Bone width={160} height={28} radius="full" />
              <Bone width={220} height={48} radius="lg" />
              <Bone width={180} height={40} radius="lg" />
            </div>
            <FormSkeleton fields={2} />
          </Loader>
        </div>
      </div>
    );
  }

  const isSpend = type === 'gasto' || type === 'ingreso';
  const accName = (aid: string | null, empty: string) => accs.find((a) => a.id === aid)?.name || empty;
  const accOptions = (empty: string) => (
    <>
      <option value="">{empty}</option>
      {accs.map((a) => (
        <option key={a.id} value={a.id}>{a.name}{a.last4 ? ` ••${a.last4}` : ''}</option>
      ))}
    </>
  );
  const typeSel = (
    <SelectPill icon={meta.icon} label={meta.label} value={type} onChange={(v) => setType(v as FormType)} ariaLabel="Tipo de movimiento">
      {typeOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </SelectPill>
  );
  const conn = (w: string) => <span className="txf-conn">{w}</span>;

  // the faces after the merchant: its logo and its category's emoji, tilted against each other
  const pickedMerchant = pickedId ? app.merchants.find((m) => m.id === pickedId) : null;
  const logo = isSpend && merchant.trim() ? (pickedMerchant ? photoUrl(pickedMerchant) : namePhoto(app.merchants, merchant)) : null;
  const faceCat = isSpend ? selectedCat : null;
  const faces = merchant.trim() && (logo || faceCat) ? (
    <span className="txf-faces" aria-hidden="true">
      {logo && <Avatar img={logo} size={40} className="txf-face txf-face--logo" />}
      {faceCat && <Avatar emoji={faceCat.emoji} color={faceCat.color} size={40} className="txf-face txf-face--cat" />}
    </span>
  ) : null;

  const aiHint = orig?.status === 'review' && orig.suggested_category_id && categoryId === orig.suggested_category_id;
  // on the phone, while the amount or the merchant has the keyboard, only the top of the form shows
  const typing = phone && (field === 'amount' || field === 'merchant');

  return (
    <div className="form-screen">
      <div className="sheet-page tx-form" role="dialog" aria-label={title} onFocus={onFocusIn} onBlur={onFocusOut}>
        {head}

        <div className="txf-main">
          <div className="txf-line">
            {typeSel}
            {isSpend && (
              <>
                {conn('en')}
                <SelectPill label={accName(accountId, 'Efectivo')} value={accountId || ''} onChange={(v) => setAccountId(v || null)} ariaLabel="Cuenta">
                  {accOptions('Efectivo o SINPE')}
                </SelectPill>
              </>
            )}
            {type === 'transferir' && (
              <>
                {conn('de')}
                <SelectPill label={accName(accountId, 'Elegir')} value={accountId || ''} onChange={(v) => setAccountId(v || null)} ariaLabel="Desde">
                  {accOptions('Elegir cuenta')}
                </SelectPill>
                {conn('a')}
                <SelectPill label={accName(toAccountId, 'Elegir')} value={toAccountId || ''} onChange={(v) => setToAccountId(v || null)} ariaLabel="Hacia">
                  {accOptions('Elegir cuenta')}
                </SelectPill>
              </>
            )}
            {type === 'aporte' && (
              <>
                {conn('de')}
                <SelectPill emoji={profiles[contributor]?.emoji} label={profiles[contributor]?.name || 'Miembro'} value={contributor} onChange={setContributor} ariaLabel="¿Quién aporta?">
                  {spaceMembers.map((m) => <option key={m.user_id} value={m.user_id}>{profiles[m.user_id]?.name || 'Miembro'}</option>)}
                </SelectPill>
                {conn('a')}
                <SelectPill label={accName(toAccountId, 'Elegir')} value={toAccountId || ''} onChange={(v) => setToAccountId(v || null)} ariaLabel="Hacia">
                  {accOptions('Elegir cuenta')}
                </SelectPill>
              </>
            )}
          </div>

          <AmountInput
            size="display"
            wrapClassName="txf-amount"
            aria-label="Monto"
            placeholder="0"
            autoFocus={autoFocusAmount}
            value={displayAmount(amount)}
            onChange={(e) => setAmount(rawAmount(e.target.value))}
            enterKeyHint="next"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                next();
              }
            }}
            positive={type === 'ingreso' || type === 'aporte'}
            unit={cur}
            onUnit={() => setCur((c) => (c === 'CRC' ? 'USD' : 'CRC'))}
            unitLabel={cur === 'CRC' ? 'En colones. Cambiar a dólares' : 'En dólares. Cambiar a colones'}
          />
          {cur !== app.cur && num > 0 && <span className="txf-eq">≈ {eq}</span>}

          <div ref={merchantRef}>
            <MerchantInput
              value={merchant}
              onChange={(v) => {
                setMerchant(v);
                setPickedId(null);
              }}
              onPick={(name, cat, mid) => {
                setMerchant(name);
                setPickedId(mid);
                if (isSpend && catFrom !== 'user' && (cat || catFrom === 'merchant')) {
                  setCategoryId(cat);
                  setCatFrom(cat ? 'merchant' : null);
                }
              }}
              onClear={() => {
                setMerchant('');
                setPickedId(null);
                if (catFrom === 'merchant') {
                  setCategoryId(null);
                  setCatFrom(null);
                }
              }}
              onDone={doneTyping}
              spaceId={spaceId}
              cats={cats}
              suggest={type !== 'aporte'}
              countWord={type === 'gasto' ? ['compra', 'compras'] : ['vez', 'veces']}
              placeholder={type === 'aporte' ? 'detalle (opcional)' : type === 'transferir' ? '¿para qué? (opcional)' : 'comercio o detalle'}
              after={faces}
            />
          </div>
        </div>

        {!typing && (
          <div className="txf-rest">
            {isSpend && (
              <div className="txf-cat">
                <span className="txf-conn">Categoría</span>
                <SelectPill
                  emoji={selectedCat?.emoji}
                  label={selectedCat ? selectedCat.name : 'Elegir'}
                  value={categoryId || ''}
                  onChange={(v) => {
                    setCategoryId(v || null);
                    setCatFrom(v ? 'user' : null);
                  }}
                  ariaLabel="Categoría"
                >
                  <option value="">Sin categoría</option>
                  {visibleCats.map((c) => (
                    <option key={c.id} value={c.id}>{c.parent_id ? '   ' : ''}{c.emoji} {c.name}</option>
                  ))}
                </SelectPill>
                {aiHint && (
                  <span className="txf-ai" title={orig?.ai_confidence ? `${Math.round(Number(orig.ai_confidence) * 100)}% de confianza` : undefined}>
                    <Icon name="wand" size={12} /> Sugerida por IA
                  </span>
                )}
              </div>
            )}
            {isSpend && (canApplyAll ? (
              <label className="check txf-check">
                <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} />
                <span>Mover todo {merchantName} a {selectedCat?.emoji} {catLabel(cats, selectedCat)}: {siblings === 1 ? 'el otro movimiento' : `los otros ${siblings} movimientos`} y los que vengan</span>
              </label>
            ) : orig && categoryChanged && fromEmail && (
              <label className="check txf-check">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                <span>Recordar: “{rulePattern(orig.raw_merchant || '')}” siempre va en {selectedCat?.emoji} {catLabel(cats, selectedCat)}</span>
              </label>
            ))}

            <div className="txf-body">
              {!id && (
                // the whole box toggles it; the switch inside handles its own tap (and the keyboard)
                <div className="txf-toggle" onClick={(e) => !(e.target as Element).closest('.ds-switch') && setRepeat((r) => !r)}>
                  <span>Recurrente</span>
                  <Switch checked={repeat} label="Recurrente" onChange={setRepeat} />
                </div>
              )}
              {type === 'transferir' && <span className="hint">Mover no cuenta como gasto ni ingreso, así el balance no se duplica.</span>}

              <Button
                variant="link"
                size="sm"
                className="txf-more"
                aria-expanded={more}
                onClick={() => setMore((m) => !m)}
                trailing={<Icon name={more ? 'chevUp' : 'chevDown'} size={12} stroke={2.4} />}
              >
                {more ? 'Menos detalles' : 'Más detalles'}
              </Button>
              {more && (
                <div className="txf-more-body">
                  {orig?.raw_merchant && (
                    <div className="from-bank">
                      <Icon name="bank" size={18} solid />
                      <span className="col">
                        <strong>Del banco: {orig.raw_merchant}</strong>
                        <span>{orig.currency} {String(orig.amount)} {orig.currency === 'USD' ? `· tipo de cambio ${Number(orig.fx_rate).toFixed(2)}` : ''}</span>
                      </span>
                    </div>
                  )}
                  <div className="field-card">
                    <label className="field-row">
                      <span>Fecha</span>
                      <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
                    </label>
                    {isSpend && <MerchantPhotoField spaceId={spaceId} name={merchant} raw={orig?.raw_merchant} merchantId={orig && merchant === orig.merchant ? orig.merchant_id : null} />}
                  </div>
                  <label className="col gap8">
                    <span className="field-label">Nota y tags <small>(opcional)</small></span>
                    <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. compra de la semana #finde" />
                  </label>
                </div>
              )}

              {error && <div className="error">{error}</div>}
              {id && (
                <Button variant="ghost" size="md" block className="danger" onClick={remove} leading={<Icon name="trash" size={16} />}>Eliminar movimiento</Button>
              )}
            </div>
          </div>
        )}

        <ActionBar>
          {askMissing && shownMissing && <p className="txf-missing" role="alert"><Icon name="warning" size={14} /> {shownMissing}</p>}
          {phone && field === 'amount' ? (
            <Button variant="primary" size="xl" block aria-disabled={num <= 0} onPointerDown={keep} onMouseDown={keep} onClick={() => (num <= 0 ? flagMissing() : next())}>Continuar</Button>
          ) : phone && field ? (
            <Button variant="primary" size="xl" block onPointerDown={keep} onMouseDown={keep} onClick={doneTyping}>Continuar</Button>
          ) : (
            <Button variant="primary" size="xl" block aria-disabled={!canSave} disabled={busy} onClick={() => (canSave ? save() : flagMissing())}>
              {busy ? 'Guardando…' : id ? 'Guardar cambios' : meta.save}
            </Button>
          )}
        </ActionBar>
        {phone && (
          <div className="form-discard">
            <Button variant="ghost" size="md" block onClick={() => closeModal()}>Descartar</Button>
          </div>
        )}
      </div>
    </div>
  );
}
