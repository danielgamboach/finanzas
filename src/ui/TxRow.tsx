import { go, useApp } from '../store';
import { money, moneyRaw, relDay } from '../lib/format';
import { tagsOf } from '../lib/calc';
import type { Tx } from '../lib/types';
import { catLabel } from '../lib/cats';
import { photoFor, photoUrl } from '../lib/photos';
import { Emo } from '.';

const KIND_EMOJI: Record<string, string> = { income: '💰', transfer: '🔄', contribution: '🤝', refund: '↩️' };
const KIND_LABEL: Record<string, string> = { income: 'Ingreso', transfer: 'Transferencia', contribution: 'Aporte', refund: 'Devolución' };

export function TxRow({ t, showDate = false }: { t: Tx; showDate?: boolean }) {
  const { categories, accounts, cur, fx, profiles, photos } = useApp();
  const cat = categories.find((c) => c.id === t.category_id);
  const acc = accounts.find((a) => a.id === t.account_id);
  const review = t.status === 'review' || (!cat && (t.kind === 'expense' || t.kind === 'income'));
  const emoji = cat?.emoji || KIND_EMOJI[t.kind] || '❓';
  const color = review ? 'butter' : cat?.color || 'gray';
  const who = t.kind === 'contribution' && t.contributor_id ? profiles[t.contributor_id]?.name : null;
  const label = [showDate ? relDay(t.occurred_at) : null, review ? 'Sin categoría' : (cat ? catLabel(categories, cat) : '') || KIND_LABEL[t.kind] || '', who, acc ? (acc.last4 ? `••${acc.last4}` : acc.name) : null]
    .filter(Boolean)
    .join(' · ');
  const inflow = t.kind === 'income' || t.kind === 'contribution' || t.kind === 'refund';
  const neutral = t.kind === 'transfer';
  const showOriginal = t.currency === 'USD' && cur === 'CRC';
  const main = showOriginal ? moneyRaw(Number(t.amount), 'USD', { sign: inflow ? '+' : '' }) : money(Number(t.amount_crc), cur, fx, { sign: inflow ? '+' : '' });
  const tags = tagsOf(t);
  const photo = t.kind === 'transfer' ? null : photoFor(photos, t.merchant, t.raw_merchant);
  const suggested = review && t.suggested_category_id ? categories.find((c) => c.id === t.suggested_category_id) : null;
  return (
    <button className="tx-row" onClick={() => go(`/mov/${t.id}`)}>
      <Emo e={emoji} color={color} img={photo ? photoUrl(photo) : null} />
      <span className="tx-mid">
        <span className="tx-cat">{label}</span>
        <span className="tx-name">{t.merchant || KIND_LABEL[t.kind] || 'Movimiento'}</span>
        {(review || t.recurring_id || tags.length > 0 || t.category_source === 'ai') && (
          <span className="chips">
            {review && !suggested && <span className="chip warn">Por revisar</span>}
            {suggested && <span className="chip ai">✨ ¿{suggested.emoji} {catLabel(categories, suggested)}?</span>}
            {!review && t.category_source === 'ai' && <span className="chip ai">✨ IA</span>}
            {t.recurring_id && <span className="chip">🔁 Recurrente</span>}
            {tags.map((g) => (
              <span key={g} className="chip">{g}</span>
            ))}
          </span>
        )}
      </span>
      <span className="tx-amt">
        <span className={inflow ? 'pos' : neutral ? 'muted' : ''}>{main}</span>
        {showOriginal && <span className="tx-sub">≈ {money(Number(t.amount_crc), 'CRC', fx)}</span>}
      </span>
    </button>
  );
}

const dateFmt = new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'short', timeZone: 'America/Costa_Rica' });
const timeFmt = new Intl.DateTimeFormat('es-CR', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Costa_Rica' });

/** Desktop: one movement as a table row (date, merchant, category, account, amount). */
export function TxTableRow({ t, hideAccount = false }: { t: Tx; hideAccount?: boolean }) {
  const { categories, accounts, cur, fx, profiles, photos } = useApp();
  const cat = categories.find((c) => c.id === t.category_id);
  const acc = accounts.find((a) => a.id === t.account_id);
  const to = accounts.find((a) => a.id === t.to_account_id);
  const review = t.status === 'review' || (!cat && (t.kind === 'expense' || t.kind === 'income'));
  const emoji = cat?.emoji || KIND_EMOJI[t.kind] || '❓';
  const color = review ? 'butter' : cat?.color || 'gray';
  const who = t.kind === 'contribution' && t.contributor_id ? profiles[t.contributor_id]?.name : null;
  const inflow = t.kind === 'income' || t.kind === 'contribution' || t.kind === 'refund';
  const neutral = t.kind === 'transfer';
  const main = money(Number(t.amount_crc), cur, fx, { sign: inflow ? '+' : '' });
  const original = t.currency === 'USD' ? moneyRaw(Number(t.amount), 'USD') : null;
  const tags = tagsOf(t);
  const photo = t.kind === 'transfer' ? null : photoFor(photos, t.merchant, t.raw_merchant);
  const suggested = review && t.suggested_category_id ? categories.find((c) => c.id === t.suggested_category_id) : null;
  const d = new Date(t.occurred_at);
  const open = () => go(`/mov/${t.id}`);
  return (
    <div className={hideAccount ? 'ttr no-acc' : 'ttr'} role="row" tabIndex={0} onClick={open} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open())}>
      <span role="cell" className="tt-date"><span>{dateFmt.format(d)}</span><span className="muted">{timeFmt.format(d)}</span></span>
      <span role="cell" className="tt-merchant">
        <Emo e={emoji} color={color} img={photo ? photoUrl(photo) : null} size={34} />
        <span className="col tt-mname">
          <span className="tt-name">{t.merchant || KIND_LABEL[t.kind] || 'Movimiento'}</span>
          {(t.note || t.recurring_id || tags.length > 0 || who) && (
            <span className="tt-meta">
              {who && <span>{who}</span>}
              {t.recurring_id && <span>🔁 Recurrente</span>}
              {tags.map((g) => <span key={g}>{g}</span>)}
              {t.note && <span className="tt-note">{t.note}</span>}
            </span>
          )}
        </span>
      </span>
      <span role="cell" className="tt-cat">
        {review ? (
          suggested ? <span className="chip ai">✨ ¿{suggested.emoji} {catLabel(categories, suggested)}?</span> : <span className="chip warn">Por revisar</span>
        ) : cat ? (
          <span className="tt-catname">{cat.emoji} {catLabel(categories, cat)}{t.category_source === 'ai' && <span className="tt-ai" title="Categorizado por IA">✨</span>}</span>
        ) : (
          <span className="muted">{KIND_LABEL[t.kind] || '—'}</span>
        )}
      </span>
      {!hideAccount && (
        <span role="cell" className="tt-acc muted">
          {acc ? `${acc.name}${acc.last4 ? ` ••${acc.last4}` : ''}` : t.kind === 'transfer' ? '—' : 'Efectivo / SINPE'}
          {to && <span> → {to.name}</span>}
        </span>
      )}
      <span role="cell" className="tt-amt">
        <span className={inflow ? 'pos' : neutral ? 'muted' : ''}>{main}</span>
        {original && <span className="muted">{original}</span>}
      </span>
    </div>
  );
}
