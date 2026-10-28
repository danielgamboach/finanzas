import { go, useApp } from '../store';
import { amount, relDay, unitOf } from '../lib/format';
import type { Tx } from '../lib/types';
import { txBadge, txPhoto } from '../lib/merchants';
import { Emo } from '.';
import { Checkbox, TxRow as TxRowView, type TxAmountTone } from '../ds';
import { CatPick } from './CatPick';

const KIND_EMOJI: Record<string, string> = { income: '💰', transfer: '🔄', contribution: '🤝', refund: '↩️' };
const KIND_LABEL: Record<string, string> = { income: 'Ingreso', transfer: 'Transferencia', contribution: 'Aporte', refund: 'Devolución' };

/** One movement: who, what kind, how much. Everything else (card, tags, IA, original currency) is in the detail. */
/** "Por revisar", or the AI's suggestion when there is one, as a hint. */
function reviewLabel(t: Tx, categories: { id: string; emoji: string; name: string }[]) {
  const s = t.suggested_category_id ? categories.find((c) => c.id === t.suggested_category_id) : null;
  return s ? `${s.emoji} ¿${s.name}?` : 'Por revisar';
}

interface Pick { selected: boolean; onToggle: () => void }
/** Movements that can take a category (and so can be selected for a bulk change). */
export const canCategorize = (t: Tx) => t.kind === 'expense' || t.kind === 'income' || t.kind === 'refund';

export function TxRow({ t, showDate = false, pick, size }: { t: Tx; showDate?: boolean; pick?: Pick; /** sheet: the smaller rows of the home sheet (default when showDate). */ size?: 'sheet' | 'list' }) {
  const { categories, cur, fx, profiles, merchants } = useApp();
  const cat = categories.find((c) => c.id === t.category_id);
  const review = t.status === 'review' || (!cat && (t.kind === 'expense' || t.kind === 'income'));
  const emoji = cat?.emoji || KIND_EMOJI[t.kind] || '❓';
  const color = review ? 'butter' : cat?.color || 'gray';
  const who = t.kind === 'contribution' && t.contributor_id ? profiles[t.contributor_id]?.name : null;
  const name = t.merchant || KIND_LABEL[t.kind] || 'Movimiento';
  let what = review ? 'Por revisar' : t.kind === 'contribution' ? `Aporte${who ? ` de ${who}` : ''}` : cat ? cat.name : KIND_LABEL[t.kind] || '';
  if (what === name) what = KIND_LABEL[t.kind] || '';
  if (t.hold === 'pending') what = 'Por confirmar';
  if (t.hold === 'void') what = 'No se cobró';
  const inflow = t.kind === 'income' || t.kind === 'contribution' || t.kind === 'refund';
  const neutral = t.kind === 'transfer';
  const main = amount(Number(t.amount_crc), cur, fx, { sign: inflow ? '+' : '' });
  const unit = unitOf(cur);
  const face = { emoji, color, img: txPhoto(merchants, t), badge: txBadge(merchants, t) };
  const context = size ?? (showDate ? 'sheet' : 'list');
  const amountTone = amtTone(t, inflow, neutral);
  // selecting several: the whole row toggles
  if (pick) {
    return <TxRowView context={context} face={face} name={name} detail={review ? reviewLabel(t, categories) : what} detailTone={review ? 'warning' : 'default'} amount={main} unit={unit} amountTone={amountTone} selecting selected={pick.selected} onClick={pick.onToggle} />;
  }
  // to review: the category line is a selector; the name still opens the detail
  if (review && t.kind !== 'transfer') {
    return (
      <TxRowView
        context={context}
        className="tx-pick"
        face={face}
        name={<button className="tx-open" onClick={() => go(`/mov/${t.id}`)}>{name}</button>}
        detail={<span className="tx-pick-line">{showDate && <span>{relDay(t.occurred_at)}</span>}<CatPick t={t} /></span>}
        amount={main}
        unit={unit}
        amountTone={inflow ? 'positive' : 'default'}
      />
    );
  }
  const detail = showDate ? [relDay(t.occurred_at), what].filter(Boolean).join(' · ') : what;
  return <TxRowView context={context} face={face} name={name} detail={detail || undefined} detailTone={review || t.hold ? 'warning' : 'default'} amount={main} unit={unit} amountTone={amountTone} onClick={() => go(`/mov/${t.id}`)} />;
}

function amtTone(t: Tx, inflow: boolean, neutral: boolean): TxAmountTone {
  if (t.hold === 'void') return 'void';
  if (t.hold === 'pending') return 'muted';
  return inflow ? 'positive' : neutral ? 'muted' : 'default';
}

/** Amount style: inflow green, transfers and pending holds quiet, never-charged holds struck through. */
function amtClass(base: string, t: Tx, inflow: boolean, neutral: boolean) {
  if (t.hold === 'void') return `${base} muted void`;
  if (t.hold === 'pending') return `${base} muted`;
  return inflow ? `${base} pos` : neutral ? `${base} muted` : base;
}

const dateFmt = new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'short', timeZone: 'America/Costa_Rica' });

/** Desktop: one movement as a table row (date, merchant, category, account, amount). Details live in the side sheet. */
export function TxTableRow({ t, hideAccount = false, pick }: { t: Tx; hideAccount?: boolean; pick?: Pick }) {
  const { categories, accounts, cur, fx, merchants } = useApp();
  const cat = categories.find((c) => c.id === t.category_id);
  const acc = accounts.find((a) => a.id === t.account_id);
  const review = t.status === 'review' || (!cat && (t.kind === 'expense' || t.kind === 'income'));
  const emoji = cat?.emoji || KIND_EMOJI[t.kind] || '❓';
  const color = review ? 'butter' : cat?.color || 'gray';
  const inflow = t.kind === 'income' || t.kind === 'contribution' || t.kind === 'refund';
  const neutral = t.kind === 'transfer';
  const main = amount(Number(t.amount_crc), cur, fx, { sign: inflow ? '+' : '' });
  const photo = txPhoto(merchants, t);
  const badge = txBadge(merchants, t);
  const open = pick ? pick.onToggle : () => go(`/mov/${t.id}`);
  const cls = ['ttr', hideAccount && 'no-acc', pick && 'selecting', pick?.selected && 'on'].filter(Boolean).join(' ');
  return (
    <div className={cls} role="row" tabIndex={0} aria-selected={pick ? pick.selected : undefined} onClick={open} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open())}>
      <span role="cell" className="tt-date">{pick && <Checkbox checked={pick.selected} />}{dateFmt.format(new Date(t.occurred_at))}</span>
      <span role="cell" className="tt-merchant">
        <Emo e={emoji} color={color} img={photo} badge={badge} size={32} />
        <span className="tt-name">{t.merchant || KIND_LABEL[t.kind] || 'Movimiento'}</span>
        {t.hold && <span className="tt-hold">{t.hold === 'pending' ? 'Por confirmar' : 'No se cobró'}</span>}
      </span>
      <span role="cell" className={review ? 'tt-cat' : 'tt-cat muted'}>
        {review && t.kind !== 'transfer' && !pick ? <CatPick t={t} /> : review ? <span className="tt-review">{reviewLabel(t, categories)}</span> : t.kind === 'contribution' ? 'Aporte' : cat ? cat.name : KIND_LABEL[t.kind] || ''}
      </span>
      {!hideAccount && <span role="cell" className="tt-acc muted">{acc ? acc.name : t.kind === 'transfer' ? '' : 'Efectivo / SINPE'}</span>}
      <span role="cell" className={amtClass('tt-amt', t, inflow, neutral)}>{main}<span className="tt-unit">{unitOf(cur)}</span></span>
    </div>
  );
}
