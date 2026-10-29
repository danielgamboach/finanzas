import { useEffect, useMemo, useRef, useState } from 'react';
import { Bone, Button, ListGroup, Loader, Money, Tag, TxListSkeleton } from '../ds';
import { DetailSkeleton } from './Skeletons';
import { createPortal } from 'react-dom';
import { db } from '../lib/api';
import { catLabel } from '../lib/cats';
import { tagsOf } from '../lib/calc';
import { amount, cap, money, moneyRaw, shortDate, unitOf } from '../lib/format';
import { normWords, photoUrl, txBadge, txMerchant, type Merchant } from '../lib/merchants';
import type { Tx } from '../lib/types';
import { useDesktop } from '../lib/useDesktop';
import { closeModal, go, TX_SELECT, useApp } from '../store';
import { Emo, Icon, Loading } from '.';
import { TxRow } from './TxRow';
import { MergeSheet } from './Merchant';
import { useDragToClose } from './useDragToClose';
import { setHold, settlesIn } from '../lib/holds';

const KIND_LABEL: Record<string, string> = { expense: 'Gasto', income: 'Ingreso', transfer: 'Transferencia', contribution: 'Aporte', refund: 'Devolución' };
const KIND_EMOJI: Record<string, string> = { income: '💰', transfer: '🔄', contribution: '🤝', refund: '↩️' };
const SOURCE_LABEL: Record<string, string> = {
  email: 'Voucher del BAC (correo)',
  import: 'Estado de cuenta importado',
  manual: 'Agregado a mano',
  recurring: 'Pago recurrente',
  system: 'Automático',
};
const fullDate = new Intl.DateTimeFormat('es-CR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Costa_Rica' });
const timeFmt = new Intl.DateTimeFormat('es-CR', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Costa_Rica' });

function close() {
  closeModal();
}

/** A movement, read-only: every detail, then the other movements of the same merchant. */
export function TxDetail({ id }: { id: string }) {
  const desk = useDesktop();
  const { version } = useApp();
  const [t, setT] = useState<Tx | null>(null);
  const [missing, setMissing] = useState(false);
  const dragRef = useDragToClose<HTMLDivElement>(close, 'self');
  const panel = useRef<HTMLDivElement | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let alive = true;
    db.from<Tx>('transactions', TX_SELECT).eq('id', id).then((rows) => {
      if (!alive) return;
      if (rows[0]) setT(rows[0]);
      else setMissing(true);
    }).catch(() => alive && setMissing(true));
    return () => {
      alive = false;
    };
  }, [id, version]);

  // deleted from the editor, or a stale link: nothing to show
  useEffect(() => {
    if (missing) close();
  }, [missing]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.sheet-backdrop')) close();
      if ((e.key === 'e' || e.key === 'E') && !(e.target as HTMLElement).closest('input, textarea, select')) go(`/mov/${id}/editar`);
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [id]);

  // a new movement opened from the list below starts at the top
  useEffect(() => {
    panel.current?.scrollTo({ top: 0 });
  }, [id]);

  const setPanel = (el: HTMLDivElement | null) => {
    panel.current = el;
    if (!desk) dragRef(el);
  };

  return createPortal(
    <div className={desk ? 'txd-backdrop side' : 'txd-backdrop'} onClick={close}>
      <div ref={setPanel} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 4)} className={desk ? 'txd side' : 'txd'} role="dialog" aria-modal="true" aria-label="Detalle del movimiento" onClick={(e) => e.stopPropagation()}>
        <div className={scrolled ? 'txd-bar scrolled' : 'txd-bar'}>
          {!desk && <div className="grabber" />}
          <Button variant="secondary" size="xs" iconOnly onClick={close} aria-label="Cerrar"><Icon name="close" size={14} stroke={2.4} /></Button>
          <Button variant="primary" size="xs" onClick={() => go(`/mov/${id}/editar`)} disabled={!t} leading={<Icon name="pencil" size={14} />} trailing={desk ? <kbd>E</kbd> : undefined}>Editar</Button>
        </div>
        {t ? <Body t={t} /> : <DetailSkeleton />}
      </div>
    </div>,
    document.body,
  );
}

function Body({ t }: { t: Tx }) {
  const { categories, accounts, cur, fx, profiles, merchants } = useApp();
  const cat = categories.find((c) => c.id === t.category_id);
  const suggested = t.suggested_category_id ? categories.find((c) => c.id === t.suggested_category_id) : null;
  const acc = accounts.find((a) => a.id === t.account_id);
  const to = accounts.find((a) => a.id === t.to_account_id);
  const review = t.status === 'review' || (!cat && (t.kind === 'expense' || t.kind === 'income'));
  const merchant = txMerchant(merchants, t);
  const photo = merchant ? photoUrl(merchant) : null;
  const inflow = t.kind === 'income' || t.kind === 'contribution' || t.kind === 'refund';
  const name = t.merchant || KIND_LABEL[t.kind] || 'Movimiento';
  const tags = tagsOf(t);
  const auth = t.note?.match(/^Autorizaci[oó]n\s+(\S+)$/i)?.[1] || null;
  const note = auth ? null : t.note?.trim() || null;
  const d = new Date(t.occurred_at);
  const who = t.contributor_id ? profiles[t.contributor_id]?.name : null;
  const by = t.created_by && t.source === 'manual' ? profiles[t.created_by]?.name : null;

  const own = t.currency === 'USD' && cur === 'CRC';
  const big = own ? amount(Number(t.amount), 'USD', 1, { sign: inflow ? '+' : '', decimals: true }) : amount(Number(t.amount_crc), cur, fx, { sign: inflow ? '+' : '' });
  const bigUnit = own ? 'USD' : unitOf(cur);
  const conv = t.currency === 'USD' ? (cur === 'CRC' ? `≈ ${money(Number(t.amount_crc), 'CRC', fx)}` : null) : cur === 'USD' ? `${moneyRaw(Number(t.amount), 'CRC')} en colones` : null;

  return (
    <>
      <header className="txd-hero">
        <Emo e={cat?.emoji || KIND_EMOJI[t.kind] || '🛍️'} color={review ? 'butter' : cat?.color || 'gray'} img={photo} badge={txBadge(merchants, t)} size={56} />
        <h2 className="txd-name">{name}</h2>
        <Money size="large" value={big} unit={bigUnit} tone={t.hold === 'void' || t.kind === 'transfer' ? 'muted' : inflow ? 'positive' : 'default'} strike={t.hold === 'void'} className="txd-amt" />
        {conv && <span className="txd-conv">{conv}</span>}
        <span className="chips center">
          {t.hold === 'pending' && <Tag tone="warning" size="sm">Por confirmar</Tag>}
              {review && !suggested && <Tag tone="warning" size="sm">Por revisar</Tag>}
          {review && suggested && <Tag tone="ai" size="sm"><Icon name="wand" size={12} />¿{suggested.emoji} {catLabel(categories, suggested)}?</Tag>}
          {t.recurring_id && <Tag size="sm"><Icon name="repeat" size={12} />Recurrente</Tag>}
          {tags.map((g) => <Tag key={g} size="sm">{g}</Tag>)}
        </span>
      </header>

      {t.hold === 'pending' && <HoldBox t={t} />}

      <section className="field-card txd-fields" aria-label="Detalles">
        <Row label="Fecha">{cap(fullDate.format(d).replace(/\./g, '').replace(/,/g, ''))} · {timeFmt.format(d)}</Row>
        <Row label="Tipo">{KIND_LABEL[t.kind] || t.kind}</Row>
        {(t.kind === 'expense' || t.kind === 'income' || t.kind === 'refund') && (
          <Row label="Categoría">
            {cat ? (
              <a className="txd-link" href={`#/categoria/${cat.id}`}>
                {cat.emoji} {catLabel(categories, cat)}
                {t.category_source === 'ai' && <span className="txd-ai" title="Categorizado por IA"><Icon name="wand" size={12} />IA</span>}
              </a>
            ) : (
              <span className="muted">Sin categoría</span>
            )}
          </Row>
        )}
        {t.kind !== 'transfer' && (t.merchant || t.raw_merchant) && <MerchantRow t={t} merchant={merchant} />}
        <Row label={t.kind === 'transfer' ? 'Desde' : 'Cuenta'}>
          {acc ? (
            <a className="txd-link" href={`#/cuenta/${acc.id}`}>{acc.name}{acc.last4 ? ` ••${acc.last4}` : ''}</a>
          ) : (
            'Efectivo / SINPE'
          )}
        </Row>
        {to && (
          <Row label="Hacia">
            <a className="txd-link" href={`#/cuenta/${to.id}`}>{to.name}{to.last4 ? ` ••${to.last4}` : ''}</a>
          </Row>
        )}
        {t.kind === 'contribution' && who && <Row label="Aportó">{who}</Row>}
        {t.currency === 'USD' && (
          <>
            <Row label="Monto original">{moneyRaw(Number(t.amount), 'USD', { decimals: true })}</Row>
            <Row label="Tipo de cambio">¢{Number(t.fx_rate).toFixed(2)} · {money(Number(t.amount_crc), 'CRC', fx)}</Row>
          </>
        )}
        {t.raw_merchant && normWords(t.raw_merchant) !== normWords(t.merchant || '') && <Row label="Como sale en el banco"><span className="txd-mono">{t.raw_merchant}</span></Row>}
        {/^APPLE\.COM/i.test(t.raw_merchant || '') && <AppleRow id={t.id} />}
        {auth && <Row label="Autorización"><span className="txd-mono">{auth}</span></Row>}
        {t.recurring_id && (
          <Row label="Recurrente">
            <a className="txd-link" href={`#/recurrente/${t.recurring_id}`}>Ver pago recurrente</a>
          </Row>
        )}
        <Row label="Origen">{SOURCE_LABEL[t.source] || t.source}{by ? ` · ${by}` : ''}</Row>
      </section>

      {note && (
        <ListGroup title="Nota">
          <p className="txd-note">{note}</p>
        </ListGroup>
      )}

      {t.kind !== 'transfer' && (t.merchant || t.raw_merchant) && <SameMerchant t={t} name={name} merchant={merchant} />}
    </>
  );
}

/** Which catalog merchant this is, with a way to fix it ("Unir con otro comercio"). */
function MerchantRow({ t, merchant }: { t: Tx; merchant: Merchant | null }) {
  const { merchants, bump, toast } = useApp();
  const [open, setOpen] = useState<null | 'pick' | Merchant>(null);
  const suggested = !merchant && t.suggested_merchant_id ? merchants.find((m) => m.id === t.suggested_merchant_id) || null : null;

  async function dismiss() {
    try {
      await db.update('transactions', { id: t.id }, { suggested_merchant_id: null });
      bump();
    } catch {
      toast('No se pudo guardar');
    }
  }

  return (
    <Row label="Comercio">
      <span className="txd-merchant">
        {merchant ? (
          <>
            {merchant.name}
            <Button variant="muted" size="xs" onClick={() => setOpen('pick')}>Cambiar</Button>
          </>
        ) : suggested ? (
          <>
            ¿Es {suggested.name}?
            <Button variant="primary" size="xs" onClick={() => setOpen(suggested)}>Sí</Button>
            <Button variant="muted" size="xs" onClick={dismiss}>No</Button>
          </>
        ) : (
          <Button variant="muted" size="xs" onClick={() => setOpen('pick')}>Unir con otro comercio</Button>
        )}
      </span>
      {open && <MergeSheet t={t} preset={open === 'pick' ? null : open} onClose={() => setOpen(null)} />}
    </Row>
  );
}

/** What an Apple charge was, from Apple's receipt ("YouTube Premium · mensual"). */
function AppleRow({ id }: { id: string }) {
  const { version } = useApp();
  const [plan, setPlan] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    db.from<{ app: string; plan: string | null }>('apple_receipts', 'app,plan').eq('transaction_id', id).limit(1)
      .then((r) => alive && setPlan(r[0] ? applePlan(r[0].app, r[0].plan) : null), () => undefined);
    return () => {
      alive = false;
    };
  }, [id, version]);
  return plan ? <Row label="Suscripción en Apple">{plan}</Row> : null;
}

function applePlan(app: string, plan: string | null) {
  const period = /\b(monthly|mensual)\b/i.test(plan || '') ? 'mensual' : /\b(yearly|annual|anual)\b/i.test(plan || '') ? 'anual' : '';
  const name = (plan || '').replace(/\s*\((monthly|yearly|annual|mensual|anual)\)/gi, '').replace(/\s*-?\s*\b(monthly|mensual|yearly|anual)\b\s*$/i, '').trim() || app.split(':')[0];
  return period ? `${name} · ${period}` : name;
}

/** A card authorization: say whether it was charged. Pending ones settle on their own after 48 h. */
function HoldBox({ t }: { t: Tx }) {
  const { toast, bump } = useApp();
  const [busy, setBusy] = useState(false);
  async function set(hold: 'void' | 'pending' | null, msg: string) {
    setBusy(true);
    const before = t.hold ?? null;
    try {
      await setHold([t.id], hold);
      toast(msg, async () => {
        await setHold([t.id], before);
        bump();
      });
      bump();
    } catch {
      toast('No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }
  return (
    <ListGroup title="¿Se cobró?" note={`Es una reserva de la app antes del viaje. Todavía no cuenta en el gasto; ${settlesIn(t)} si no la marcás.`}>
      <div className="hold-btns">
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => set('void', `${t.merchant || 'Movimiento'}: eliminado, no se cobró`)}>No se cobró</Button>
        <Button variant="primary" size="sm" disabled={busy} onClick={() => set(null, 'Confirmado')}>Sí, se cobró</Button>
      </div>
    </ListGroup>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field-row txd-row">
      <span>{label}</span>
      <span className="txd-val">{children}</span>
    </div>
  );
}

/** Every other movement of this merchant in the space: all its branches when it is in the catalog, by name otherwise. */
function SameMerchant({ t, name, merchant }: { t: Tx; name: string; merchant: Merchant | null }) {
  const { cur, fx, version } = useApp();
  const [rows, setRows] = useState<Tx[] | null>(null);
  const [shown, setShown] = useState(20);

  useEffect(() => {
    let alive = true;
    setRows(null);
    setShown(20);
    const q = db.from<Tx>('transactions', TX_SELECT).eq('space_id', t.space_id).neq('kind', 'transfer').order('occurred_at', false).limit(400);
    const quote = (v: string) => `"${v.replace(/["\\]/g, '')}"`;
    if (merchant) {
      q.eq('merchant_id', merchant.id);
    } else {
      const conds = [];
      if (t.merchant) conds.push(`merchant.eq.${quote(t.merchant)}`);
      if (t.raw_merchant) conds.push(`raw_merchant.eq.${quote(t.raw_merchant)}`);
      if (t.merchant_key) conds.push(`merchant_key.eq.${quote(t.merchant_key)}`);
      q.or(...conds);
    }
    q.then((all) => {
      if (!alive) return;
      setRows(all);
    }).catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.id, merchant?.id, version]);

  const stats = useMemo(() => {
    if (!rows) return null;
    const spent = rows.filter((x) => x.kind === 'expense' || x.kind === 'refund');
    const total = spent.reduce((a, x) => a + (x.kind === 'refund' ? -1 : 1) * Number(x.amount_crc), 0);
    const buys = spent.filter((x) => x.kind === 'expense').length;
    const first = rows.length ? rows[rows.length - 1].occurred_at : null;
    return { total, buys, avg: buys ? total / buys : 0, first };
  }, [rows]);

  const others = rows?.filter((x) => x.id !== t.id) || [];
  const title = merchant ? merchant.name : name;

  return (
    <ListGroup
      title={`Más de ${title}`}
      note={stats?.first && rows && rows.length > 1 ? `Desde el ${shortDate(stats.first)}${rows.length >= 400 ? ' (últimos 400)' : ''}` : undefined}
      footer={others.length > shown ? <Button variant="ghost" size="xs" onClick={() => setShown((n) => n + 40)}>Ver {Math.min(40, others.length - shown)} más</Button> : undefined}
    >
      {!rows ? (
        <Loader><div className="txd-stats">{[0, 1, 2].map((i) => <span key={i}><Bone width={56} height={16} /><Bone width={44} height={10} /></span>)}</div><TxListSkeleton days={1} rows={3} /></Loader>
      ) : (
        <>
          {stats && stats.buys > 0 && (
            <div className="txd-stats">
              <span><strong>{stats.buys}</strong>{stats.buys === 1 ? 'compra' : 'compras'}</span>
              <span><strong>{amount(stats.total, cur, fx)}</strong>en total</span>
              <span><strong>{amount(stats.avg, cur, fx)}</strong>promedio</span>
            </div>
          )}
          {others.length === 0 ? (
            <p className="group-pad page-text">Es el único movimiento de este comercio.</p>
          ) : (
            <div className="txd-list">
              {others.slice(0, shown).map((x) => <TxRow key={x.id} t={x} showDate size="sheet" />)}
            </div>
          )}
        </>
      )}
    </ListGroup>
  );
}
