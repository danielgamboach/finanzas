import { go, useApp } from '../store';
import { money, relDay } from '../lib/format';
import type { Tx } from '../lib/types';
import { catLabel } from '../lib/cats';
import { photoFor, photoUrl } from '../lib/photos';
import { Emo } from '.';
import { CatPick } from './CatPick';

const KIND_EMOJI: Record<string, string> = { income: '💰', transfer: '🔄', contribution: '🤝', refund: '↩️' };
const KIND_LABEL: Record<string, string> = { income: 'Ingreso', transfer: 'Transferencia', contribution: 'Aporte', refund: 'Devolución' };

/** One movement: who, what kind, how much. Everything else (card, tags, IA, original currency) is in the detail. */
export function TxRow({ t, showDate = false }: { t: Tx; showDate?: boolean }) {
  const { categories, cur, fx, profiles, photos } = useApp();
  const cat = categories.find((c) => c.id === t.category_id);
  const review = t.status === 'review' || (!cat && (t.kind === 'expense' || t.kind === 'income'));
  const emoji = cat?.emoji || KIND_EMOJI[t.kind] || '❓';
  const color = review ? 'butter' : cat?.color || 'gray';
  const who = t.kind === 'contribution' && t.contributor_id ? profiles[t.contributor_id]?.name : null;
  const name = t.merchant || KIND_LABEL[t.kind] || 'Movimiento';
  let what = review ? 'Por revisar' : t.kind === 'contribution' ? `Aporte${who ? ` de ${who}` : ''}` : cat ? catLabel(categories, cat) : KIND_LABEL[t.kind] || '';
  if (what === name) what = KIND_LABEL[t.kind] || '';
  const inflow = t.kind === 'income' || t.kind === 'contribution' || t.kind === 'refund';
  const neutral = t.kind === 'transfer';
  const main = money(Number(t.amount_crc), cur, fx, { sign: inflow ? '+' : '' });
  const photo = t.kind === 'transfer' ? null : photoFor(photos, t.merchant, t.raw_merchant);
  // to review: the category line is a selector; the name still opens the detail (stretched over the row)
  if (review && t.kind !== 'transfer') {
    return (
      <div className="tx-row pick">
        <Emo e={emoji} color={color} img={photo ? photoUrl(photo) : null} />
        <span className="tx-mid">
          <button className="tx-name tx-open" onClick={() => go(`/mov/${t.id}`)}>{name}</button>
          <span className="tx-pick-line">
            {showDate && <span className="tx-cat">{relDay(t.occurred_at)}</span>}
            <CatPick t={t} />
          </span>
        </span>
        <span className={inflow ? 'tx-amt pos' : 'tx-amt'}>{main}</span>
      </div>
    );
  }
  return (
    <button className="tx-row" onClick={() => go(`/mov/${t.id}`)}>
      <Emo e={emoji} color={color} img={photo ? photoUrl(photo) : null} />
      <span className="tx-mid">
        <span className="tx-name">{name}</span>
        {(what || showDate) && <span className={review ? 'tx-cat warn' : 'tx-cat'}>{showDate ? [relDay(t.occurred_at), what].filter(Boolean).join(' · ') : what}</span>}
      </span>
      <span className={inflow ? 'tx-amt pos' : neutral ? 'tx-amt muted' : 'tx-amt'}>{main}</span>
    </button>
  );
}

const dateFmt = new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'short', timeZone: 'America/Costa_Rica' });

/** Desktop: one movement as a table row (date, merchant, category, account, amount). Details live in the side sheet. */
export function TxTableRow({ t, hideAccount = false }: { t: Tx; hideAccount?: boolean }) {
  const { categories, accounts, cur, fx, photos } = useApp();
  const cat = categories.find((c) => c.id === t.category_id);
  const acc = accounts.find((a) => a.id === t.account_id);
  const review = t.status === 'review' || (!cat && (t.kind === 'expense' || t.kind === 'income'));
  const emoji = cat?.emoji || KIND_EMOJI[t.kind] || '❓';
  const color = review ? 'butter' : cat?.color || 'gray';
  const inflow = t.kind === 'income' || t.kind === 'contribution' || t.kind === 'refund';
  const neutral = t.kind === 'transfer';
  const main = money(Number(t.amount_crc), cur, fx, { sign: inflow ? '+' : '' });
  const photo = t.kind === 'transfer' ? null : photoFor(photos, t.merchant, t.raw_merchant);
  const open = () => go(`/mov/${t.id}`);
  return (
    <div className={hideAccount ? 'ttr no-acc' : 'ttr'} role="row" tabIndex={0} onClick={open} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open())}>
      <span role="cell" className="tt-date">{dateFmt.format(new Date(t.occurred_at))}</span>
      <span role="cell" className="tt-merchant">
        <Emo e={emoji} color={color} img={photo ? photoUrl(photo) : null} size={32} />
        <span className="tt-name">{t.merchant || KIND_LABEL[t.kind] || 'Movimiento'}</span>
      </span>
      <span role="cell" className={review ? 'tt-cat' : 'tt-cat muted'}>
        {review && t.kind !== 'transfer' ? <CatPick t={t} /> : t.kind === 'contribution' ? 'Aporte' : cat ? catLabel(categories, cat) : KIND_LABEL[t.kind] || ''}
      </span>
      {!hideAccount && <span role="cell" className="tt-acc muted">{acc ? acc.name : t.kind === 'transfer' ? '' : 'Efectivo / SINPE'}</span>}
      <span role="cell" className={inflow ? 'tt-amt pos' : neutral ? 'tt-amt muted' : 'tt-amt'}>{main}</span>
    </div>
  );
}
