import { go, useApp } from '../store';
import { money, moneyRaw, relDay } from '../lib/format';
import { tagsOf } from '../lib/calc';
import type { Tx } from '../lib/types';
import { Emo } from '.';

const KIND_EMOJI: Record<string, string> = { income: '💰', transfer: '🔄', contribution: '🤝', refund: '↩️' };
const KIND_LABEL: Record<string, string> = { income: 'Ingreso', transfer: 'Transferencia', contribution: 'Aporte', refund: 'Devolución' };

export function TxRow({ t, showDate = false }: { t: Tx; showDate?: boolean }) {
  const { categories, accounts, cur, fx, profiles } = useApp();
  const cat = categories.find((c) => c.id === t.category_id);
  const acc = accounts.find((a) => a.id === t.account_id);
  const review = t.status === 'review' || (!cat && (t.kind === 'expense' || t.kind === 'income'));
  const emoji = cat?.emoji || KIND_EMOJI[t.kind] || '❓';
  const color = review ? 'butter' : cat?.color || 'gray';
  const who = t.kind === 'contribution' && t.contributor_id ? profiles[t.contributor_id]?.name : null;
  const label = [showDate ? relDay(t.occurred_at) : null, review ? 'Sin categoría' : cat?.name || KIND_LABEL[t.kind] || '', who, acc ? (acc.last4 ? `••${acc.last4}` : acc.name) : null]
    .filter(Boolean)
    .join(' · ');
  const inflow = t.kind === 'income' || t.kind === 'contribution' || t.kind === 'refund';
  const neutral = t.kind === 'transfer';
  const showOriginal = t.currency === 'USD' && cur === 'CRC';
  const main = showOriginal ? moneyRaw(Number(t.amount), 'USD', { sign: inflow ? '+' : '' }) : money(Number(t.amount_crc), cur, fx, { sign: inflow ? '+' : '' });
  const tags = tagsOf(t);
  const suggested = review && t.suggested_category_id ? categories.find((c) => c.id === t.suggested_category_id) : null;
  return (
    <button className="tx-row" onClick={() => go(`/mov/${t.id}`)}>
      <Emo e={emoji} color={color} />
      <span className="tx-mid">
        <span className="tx-cat">{label}</span>
        <span className="tx-name">{t.merchant || KIND_LABEL[t.kind] || 'Movimiento'}</span>
        {(review || t.recurring_id || tags.length > 0 || t.category_source === 'ai') && (
          <span className="chips">
            {review && !suggested && <span className="chip warn">Por revisar</span>}
            {suggested && <span className="chip ai">✨ ¿{suggested.emoji} {suggested.name}?</span>}
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
