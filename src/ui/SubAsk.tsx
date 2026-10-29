import { useState } from 'react';
import { Button, Chip, ListGroup, ListRow } from '../ds';
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
export function SubAsk(_: { variant?: 'sheet' | 'card' }) {
  const { space } = useApp();
  const rows = usePendingSubs(space?.id);
  const [all, setAll] = useState(false);
  if (!rows.length) return null;
  const list = all ? rows : rows.slice(0, SHOWN);
  const footer = rows.length > SHOWN ? <Button variant="ghost" size="xs" onClick={() => setAll((v) => !v)}>{all ? 'Ver menos' : `Ver ${rows.length - SHOWN} más`}</Button> : undefined;
  return (
    <ListGroup title="¿Es una suscripción?" count={rows.length} footer={footer}>
      {list.map((t) => <SubRow key={t.id} t={t} />)}
    </ListGroup>
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
      toast(isSub ? `${name} quedó en Recurrentes` : `${name}: listo, no es suscripción`, async () => {
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
    <ListRow
      leading={<Emo e={cat?.emoji || '💳'} color={cat?.color || 'gray'} img={txPhoto(merchants, t)} size={40} />}
      title={name}
      detail={`${relDay(t.occurred_at)} · ${money}`}
      onClick={() => go(`/mov/${t.id}`)}
      actions={step === 'ask' ? (
        <>
          <Button variant="secondary" size="xs" disabled={busy} onClick={() => answer(false)} aria-label={`${name}: no es suscripción`}>No</Button>
          <Button variant="primary" size="xs" disabled={busy} onClick={() => setStep('freq')} aria-label={`${name}: sí es suscripción`}>Sí</Button>
        </>
      ) : (
        <Button variant="ghost" size="xs" disabled={busy} onClick={() => setStep('ask')}>Volver</Button>
      )}
      below={step === 'freq' ? (
        <div className="sub-freq" role="group" aria-label={`¿Cada cuánto se cobra ${name}?`}>
          <span className="sub-freq-q">¿Cada cuánto se cobra?</span>
          <div className="sub-freq-chips">
            {FREQS.map(([f, label]) => <Chip key={f} size="sm" disabled={busy} onClick={() => answer(true, f)}>{label}</Chip>)}
          </div>
        </div>
      ) : undefined}
    />
  );
}
