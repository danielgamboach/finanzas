import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../lib/api';
import { catLabel } from '../lib/cats';
import { tagsOf } from '../lib/calc';
import { cap, money, moneyRaw, shortDate } from '../lib/format';
import { normWords, photoFor, photoUrl } from '../lib/photos';
import type { Tx } from '../lib/types';
import { useDesktop } from '../lib/useDesktop';
import { go, TX_SELECT, useApp } from '../store';
import { Emo, Icon, Loading } from '.';
import { TxRow } from './TxRow';
import { useDragToClose } from './useDragToClose';

const KIND_LABEL: Record<string, string> = { expense: 'Gasto', income: 'Ingreso', transfer: 'Transferencia', contribution: 'Aporte', refund: 'Devolución' };
const KIND_EMOJI: Record<string, string> = { income: '💰', transfer: '🔄', contribution: '🤝', refund: '↩️' };
const SOURCE_LABEL: Record<string, string> = {
  email: 'Voucher del BAC (correo)',
  import: 'Estado de cuenta importado',
  manual: 'Agregado a mano',
  recurring: 'Pago recurrente',
  system: 'Automático',
};
const fullDate = new Intl.DateTimeFormat('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Costa_Rica' });
const timeFmt = new Intl.DateTimeFormat('es-CR', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Costa_Rica' });

function close() {
  if (history.length > 1) history.back();
  else go('/');
}

/** A movement, read-only: every detail, then the other movements of the same merchant. */
export function TxDetail({ id }: { id: string }) {
  const desk = useDesktop();
  const { version } = useApp();
  const [t, setT] = useState<Tx | null>(null);
  const [missing, setMissing] = useState(false);
  const dragRef = useDragToClose<HTMLDivElement>(close, 'self');
  const panel = useRef<HTMLDivElement | null>(null);

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
      <div ref={setPanel} className={desk ? 'txd side' : 'txd'} role="dialog" aria-modal="true" aria-label="Detalle del movimiento" onClick={(e) => e.stopPropagation()}>
        {!desk && <div className="grabber" />}
        <div className="txd-bar">
          <button className="round light" onClick={close} aria-label="Cerrar">
            <Icon name="close" size={18} stroke={2.4} />
          </button>
          <button className="txd-edit" onClick={() => go(`/mov/${id}/editar`)} disabled={!t}>
            <Icon name="pencil" size={16} />
            Editar
            {desk && <kbd>E</kbd>}
          </button>
        </div>
        {t ? <Body t={t} /> : <Loading />}
      </div>
    </div>,
    document.body,
  );
}

function Body({ t }: { t: Tx }) {
  const { categories, accounts, cur, fx, profiles, photos } = useApp();
  const cat = categories.find((c) => c.id === t.category_id);
  const suggested = t.suggested_category_id ? categories.find((c) => c.id === t.suggested_category_id) : null;
  const acc = accounts.find((a) => a.id === t.account_id);
  const to = accounts.find((a) => a.id === t.to_account_id);
  const review = t.status === 'review' || (!cat && (t.kind === 'expense' || t.kind === 'income'));
  const photo = t.kind === 'transfer' ? null : photoFor(photos, t.merchant, t.raw_merchant);
  const inflow = t.kind === 'income' || t.kind === 'contribution' || t.kind === 'refund';
  const name = t.merchant || KIND_LABEL[t.kind] || 'Movimiento';
  const tags = tagsOf(t);
  const auth = t.note?.match(/^Autorizaci[oó]n\s+(\S+)$/i)?.[1] || null;
  const note = auth ? null : t.note?.trim() || null;
  const d = new Date(t.occurred_at);
  const who = t.contributor_id ? profiles[t.contributor_id]?.name : null;
  const by = t.created_by && t.source === 'manual' ? profiles[t.created_by]?.name : null;

  const big = t.currency === 'USD' && cur === 'CRC' ? moneyRaw(Number(t.amount), 'USD', { sign: inflow ? '+' : '', decimals: true }) : money(Number(t.amount_crc), cur, fx, { sign: inflow ? '+' : '' });
  const conv = t.currency === 'USD' ? (cur === 'CRC' ? `≈ ${money(Number(t.amount_crc), 'CRC', fx)}` : null) : cur === 'USD' ? `${moneyRaw(Number(t.amount), 'CRC')} en colones` : null;

  return (
    <>
      <header className="txd-hero">
        <Emo e={cat?.emoji || KIND_EMOJI[t.kind] || '🛍️'} color={review ? 'butter' : cat?.color || 'gray'} img={photo ? photoUrl(photo) : null} size={64} />
        <h2 className="txd-name">{name}</h2>
        <span className={inflow ? 'txd-amt pos' : t.kind === 'transfer' ? 'txd-amt muted' : 'txd-amt'}>{big}</span>
        {conv && <span className="txd-conv">{conv}</span>}
        <span className="chips center">
          {review && !suggested && <span className="chip warn">Por revisar</span>}
          {review && suggested && <span className="chip ai">✨ ¿{suggested.emoji} {catLabel(categories, suggested)}?</span>}
          {t.recurring_id && <span className="chip">🔁 Recurrente</span>}
          {tags.map((g) => <span key={g} className="chip">{g}</span>)}
        </span>
      </header>

      <section className="field-card txd-fields" aria-label="Detalles">
        <Row label="Fecha">{cap(fullDate.format(d))}</Row>
        <Row label="Hora">{timeFmt.format(d)}</Row>
        <Row label="Tipo">{KIND_LABEL[t.kind] || t.kind}</Row>
        {(t.kind === 'expense' || t.kind === 'income' || t.kind === 'refund') && (
          <Row label="Categoría">
            {cat ? (
              <a className="txd-link" href={`#/categoria/${cat.id}`}>
                {cat.emoji} {catLabel(categories, cat)}
                {t.category_source === 'ai' && <span className="txd-ai" title="Categorizado por IA">✨ IA</span>}
              </a>
            ) : (
              <span className="muted">Sin categoría</span>
            )}
          </Row>
        )}
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
            <Row label="Tipo de cambio">₡{Number(t.fx_rate).toFixed(2)} · {money(Number(t.amount_crc), 'CRC', fx)}</Row>
          </>
        )}
        {t.raw_merchant && normWords(t.raw_merchant) !== normWords(t.merchant || '') && <Row label="Como sale en el banco"><span className="txd-mono">{t.raw_merchant}</span></Row>}
        {auth && <Row label="Autorización"><span className="txd-mono">{auth}</span></Row>}
        {t.recurring_id && (
          <Row label="Recurrente">
            <a className="txd-link" href={`#/recurrente/${t.recurring_id}`}>Ver pago recurrente</a>
          </Row>
        )}
        <Row label="Origen">{SOURCE_LABEL[t.source] || t.source}{by ? ` · ${by}` : ''}</Row>
      </section>

      {note && (
        <section className="txd-note" aria-label="Nota">
          <span className="muted small">Nota</span>
          <p>{note}</p>
        </section>
      )}

      {t.kind !== 'transfer' && (t.merchant || t.raw_merchant) && <SameMerchant t={t} name={name} />}
    </>
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

/** Every other movement of this merchant in the space: by its photo pattern when it has one, by name otherwise. */
function SameMerchant({ t, name }: { t: Tx; name: string }) {
  const { photos, cur, fx, version } = useApp();
  const [rows, setRows] = useState<Tx[] | null>(null);
  const [shown, setShown] = useState(20);
  const photo = photoFor(photos, t.merchant, t.raw_merchant);

  useEffect(() => {
    let alive = true;
    setRows(null);
    setShown(20);
    const q = db.from<Tx>('transactions', TX_SELECT).eq('space_id', t.space_id).neq('kind', 'transfer').order('occurred_at', false).limit(400);
    const quote = (v: string) => `"${v.replace(/["\\]/g, '')}"`;
    if (photo) {
      // loose search on the server, exact whole-word match here
      const like = '*' + normWords(photo.pattern).trim().split(' ').join('*') + '*';
      q.or(`merchant.ilike.${quote(like)}`, `raw_merchant.ilike.${quote(like)}`);
    } else {
      const conds = [];
      if (t.merchant) conds.push(`merchant.eq.${quote(t.merchant)}`);
      if (t.raw_merchant) conds.push(`raw_merchant.eq.${quote(t.raw_merchant)}`);
      if (t.merchant_key) conds.push(`merchant_key.eq.${quote(t.merchant_key)}`);
      q.or(...conds);
    }
    q.then((all) => {
      if (!alive) return;
      setRows(photo ? all.filter((x) => photoFor(photos, x.merchant, x.raw_merchant)?.id === photo.id) : all);
    }).catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.id, photo?.id, version]);

  const stats = useMemo(() => {
    if (!rows) return null;
    const spent = rows.filter((x) => x.kind === 'expense' || x.kind === 'refund');
    const total = spent.reduce((a, x) => a + (x.kind === 'refund' ? -1 : 1) * Number(x.amount_crc), 0);
    const buys = spent.filter((x) => x.kind === 'expense').length;
    const first = rows.length ? rows[rows.length - 1].occurred_at : null;
    return { total, buys, avg: buys ? total / buys : 0, first };
  }, [rows]);

  const others = rows?.filter((x) => x.id !== t.id) || [];
  const title = photo ? photo.pattern : name;

  return (
    <section className="txd-more" aria-label={`Más de ${title}`}>
      <h3 className="txd-h3">Más de {title}</h3>
      {!rows ? (
        <Loading />
      ) : (
        <>
          {stats && stats.buys > 0 && (
            <div className="txd-stats">
              <span><strong>{stats.buys}</strong>{stats.buys === 1 ? 'compra' : 'compras'}</span>
              <span><strong>{money(stats.total, cur, fx)}</strong>en total</span>
              <span><strong>{money(stats.avg, cur, fx)}</strong>promedio</span>
            </div>
          )}
          {stats?.first && rows.length > 1 && <p className="txd-since">Desde el {shortDate(stats.first)}{rows.length >= 400 ? ' (últimos 400)' : ''}</p>}
          {others.length === 0 ? (
            <p className="empty center-text">Es el único movimiento de este comercio.</p>
          ) : (
            <div className="txd-list">
              {others.slice(0, shown).map((x) => <TxRow key={x.id} t={x} showDate />)}
              {others.length > shown && (
                <button className="tt-more" onClick={() => setShown((n) => n + 40)}>Ver {Math.min(40, others.length - shown)} más</button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
