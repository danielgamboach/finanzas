import { useState } from 'react';
import { Badge, Button, Chip } from '../ds';
import { amount, relDay, unitOf } from '../lib/format';
import { txPhoto } from '../lib/merchants';
import { answerSub, undoSub, usePendingSubs } from '../lib/subscriptions';
import type { Frequency, Tx } from '../lib/types';
import { go, useApp } from '../store';
import { Emo } from '.';

const FREQS: [Frequency, string][] = [['monthly', 'Mensual'], ['yearly', 'Anual'], ['weekly', 'Semanal'], ['quarterly', 'Trimestral']];
const SHOWN = 3;

/**
 * A charge that looks digital asks once, like the Uber rides do: is it a subscription? No keeps it as a
 * normal expense and never asks about that merchant again. Yes asks how often and adds it to Recurrentes,
 * linked to this charge. One row per merchant. Renders nothing when there's nothing to ask.
 */
export function SubAsk({ variant = 'sheet' }: { variant?: 'sheet' | 'card' }) {
  const { space } = useApp();
  const rows = usePendingSubs(space?.id);
  const [all, setAll] = useState(false);
  if (!rows.length) return null;
  const list = all ? rows : rows.slice(0, SHOWN);
  return (
    <section className={variant === 'card' ? 'pp pp-card' : 'pp'} aria-label="¿Es una suscripción?">
      <div className="pp-head">
        <span>¿Es una suscripción?</span>
        <Badge count={rows.length} />
      </div>
      <div className="pp-list">
        {list.map((t) => <SubRow key={t.id} t={t} />)}
        {rows.length > SHOWN && (
          <div className="hold-foot">
            <Button variant="ghost" size="xs" onClick={() => setAll((v) => !v)}>{all ? 'Ver menos' : `Ver ${rows.length - SHOWN} más`}</Button>
            <span />
          </div>
        )}
      </div>
    </section>
  );
}

function SubRow({ t }: { t: Tx }) {
  const { categories, merchants, cur, fx, toast, bump } = useApp();
  const [step, setStep] = useState<'ask' | 'freq'>('ask');
  const [busy, setBusy] = useState(false);
  const cat = categories.find((c) => c.id === t.category_id);
  const name = t.merchant || 'Cobro';
  // the original currency says more here (plans are priced in it)
  const own = t.currency === 'USD' && cur === 'CRC';
  const money = own ? `${amount(Number(t.amount), 'USD', 1)} USD` : `${amount(Number(t.amount_crc), cur, fx)} ${unitOf(cur)}`;

  async function answer(isSub: boolean, f?: Frequency) {
    setBusy(true);
    try {
      await answerSub(t, isSub, f);
      toast(isSub ? `🔁 ${name} quedó en Recurrentes` : `${name}: listo, no es suscripción`, async () => {
        await undoSub(t);
        bump();
      });
      bump();
    } catch {
      toast('No se pudo guardar');
      setBusy(false);
    }
  }

  return (
    <div className={step === 'freq' ? 'pp-row sub-row is-open' : 'pp-row sub-row'}>
      <div className="sub-top">
        <button className="pp-main" onClick={() => go(`/mov/${t.id}`)}>
          <Emo e={cat?.emoji || '💳'} color={cat?.color || 'gray'} img={txPhoto(merchants, t)} size={40} />
          <span className="pp-mid">
            <span className="pp-name">{name}</span>
            <span className="pp-sub">{relDay(t.occurred_at)} · {money}</span>
          </span>
        </button>
        {step === 'ask' ? (
          <span className="sub-actions">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => answer(false)}>No</Button>
            <Button variant="primary" size="sm" disabled={busy} onClick={() => setStep('freq')}>Sí</Button>
          </span>
        ) : (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setStep('ask')}>Volver</Button>
        )}
      </div>
      {step === 'freq' && (
        <div className="sub-freq" role="group" aria-label={`¿Cada cuánto se cobra ${name}?`}>
          <span className="sub-freq-q">¿Cada cuánto se cobra?</span>
          <div className="sub-freq-chips">
            {FREQS.map(([f, label]) => <Chip key={f} size="sm" disabled={busy} onClick={() => answer(true, f)}>{label}</Chip>)}
          </div>
        </div>
      )}
    </div>
  );
}
