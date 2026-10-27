import { useEffect, useState } from 'react';
import { Button, Progress } from '../ds';
import { db } from '../lib/api';
import { enablePush, permission, pushSupport } from '../lib/push';
import { go, useApp } from '../store';
import { shareInvite } from '../screens/Onboarding';
import { Icon, Sheet } from './index';

interface Item {
  key: string;
  emoji: string;
  title: string;
  sub: string;
  done: boolean;
  run: () => void | Promise<void>;
}

/**
 * "Primeros pasos": a short checklist on Inicio for people who just signed up.
 * Each step checks itself off from real data; it can be hidden any time (with undo).
 */
export function GettingStarted({ variant }: { variant: 'sheet' | 'card' }) {
  const { profile, userId, spaces, members, version, toast, reloadMeta } = useApp();
  const [st, setSt] = useState<{ tx: boolean; acc: boolean; rec: boolean; lim: boolean } | null>(null);
  const [perm, setPerm] = useState(permission());
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const active = !!profile?.onboarded_at && !profile?.setup_hidden;

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const one = (q: PromiseLike<unknown[]>) => Promise.resolve(q).then((r) => r.length > 0, () => false);
    Promise.all([
      one(db.from('transactions', 'id').limit(1)),
      one(db.from('accounts', 'id').limit(1)),
      one(db.from('recurring', 'id').limit(1)),
      one(db.from('categories', 'id').gte('limit_amount', 0.01).limit(1)),
    ]).then(([tx, acc, rec, lim]) => alive && setSt({ tx, acc, rec, lim }));
    return () => {
      alive = false;
    };
  }, [active, version]);

  if (!active || !st) return null;

  // a shared space they own: invite until someone else joins
  const ownShared = spaces.find((s) => s.kind === 'shared' && members.some((m) => m.space_id === s.id && m.user_id === userId && m.role === 'owner'));
  const sharedCount = ownShared ? members.filter((m) => m.space_id === ownShared.id).length : 0;
  const support = pushSupport();

  const items: Item[] = [
    { key: 'tx', emoji: '✍️', title: 'Anotá tu primer gasto', sub: 'Tocá + arriba y listo, toma segundos.', done: st.tx, run: () => go('/agregar') },
    { key: 'acc', emoji: '💳', title: 'Agregá una cuenta', sub: 'La tarjeta o el efectivo con que pagás.', done: st.acc, run: () => go('/cuenta/nueva') },
    { key: 'rec', emoji: '🔁', title: 'Agregá tus pagos fijos', sub: 'Alquiler, servicios, suscripciones. Te avisamos antes.', done: st.rec, run: () => go('/recurrentes') },
    { key: 'lim', emoji: '🎯', title: 'Ponele un límite a una categoría', sub: 'Así sabés cuánto te queda en el mes.', done: st.lim, run: () => go('/analisis') },
  ];
  if (ownShared) {
    items.push({
      key: 'inv',
      emoji: '💌',
      title: `Invitá a alguien a ${ownShared.name}`,
      sub: 'Le mandamos un enlace para unirse.',
      done: sharedCount > 1,
      run: async () => {
        const code = await db.rpc<string>('create_invite', { p_space: ownShared.id });
        if ((await shareInvite(code, ownShared.name)) === 'copied') toast('Enlace copiado. Pasáselo por donde querás.');
      },
    });
  }
  if (support !== 'unsupported') {
    items.push({
      key: 'push',
      emoji: '🔔',
      title: 'Activá las notificaciones',
      sub: support === 'ios-install' ? 'En iPhone, primero agregá la app a tu pantalla de inicio.' : 'Solo para límites y el pago de la tarjeta.',
      done: perm === 'granted',
      run: async () => {
        if (support === 'ios-install') return go('/ajustes');
        const p = await enablePush();
        setPerm(p);
        if (p === 'granted') toast('🔔 Notificaciones activadas');
        else if (p === 'denied') toast('Quedaron bloqueadas. Podés activarlas en los ajustes del teléfono.');
      },
    });
  }

  const total = items.length;
  const doneCount = items.filter((i) => i.done).length;
  const all = doneCount === total;

  async function setHidden(v: boolean) {
    await db.update('profiles', { id: userId }, { setup_hidden: v }).catch(() => undefined);
    await reloadMeta();
  }
  async function hide() {
    await setHidden(true);
    if (!all) toast('Ocultamos los primeros pasos', () => setHidden(false));
  }
  async function run(i: Item) {
    if (i.done || busy) return;
    setBusy(i.key);
    try {
      await i.run();
    } catch {
      toast('No se pudo. Probá de nuevo en un momento.');
    } finally {
      setBusy(null);
    }
  }

  const next = items.find((i) => !i.done);
  const row = (i: Item) => (
    <li key={i.key}>
      <button className={i.done ? 'gs-item done' : 'gs-item'} onClick={() => run(i)} disabled={busy === i.key} aria-disabled={i.done}>
        <span className={i.done ? 'gs-check on' : 'gs-check'} aria-hidden="true">{i.done ? <Icon name="check" size={14} stroke={3} /> : i.emoji}</span>
        <span className="gs-text">
          <span className="gs-item-title">{i.title}{i.done && <span className="sr"> (listo)</span>}</span>
          {!i.done && <span className="gs-item-sub">{i.sub}</span>}
        </span>
        {!i.done && <Icon name="chevRight" size={18} />}
      </button>
    </li>
  );

  return (
    <section className={`gs ${variant === 'card' ? 'gs-card dcard' : 'gs-sheet'}`} aria-labelledby={`gs-title-${variant}`}>
      <div className="gs-head">
        <span className="col">
          <strong id={`gs-title-${variant}`} className="gs-title">{all ? '¡Terminaste los primeros pasos! 🎉' : 'Primeros pasos'}</strong>
          <span className="gs-count">{all ? 'Ya tenés todo listo.' : `${doneCount} de ${total} listos`}</span>
        </span>
        {all ? (
          <Button variant="primary" size="md" onClick={hide}>Cerrar</Button>
        ) : (
          <Button variant="ghost" size="md" iconOnly className="gs-close" onClick={hide} aria-label="Ocultar primeros pasos"><Icon name="close" size={18} /></Button>
        )}
      </div>
      <Progress className="gs-bar" tone="success" value={doneCount / total} label="Primeros pasos completados" />
      {!all && variant === 'card' && <ul className="gs-list">{items.map(row)}</ul>}
      {!all && variant === 'sheet' && next && (
        <>
          <ul className="gs-list">{row(next)}</ul>
          <button className="gs-more" onClick={() => setShowAll(true)}>Ver los {total} pasos</button>
        </>
      )}
      {showAll && (
        <Sheet title="Primeros pasos" onClose={() => setShowAll(false)}>
          <span className="gs-count">{doneCount} de {total} listos. Todo es opcional, a tu ritmo.</span>
          <ul className="gs-list">{items.map((i) => row({ ...i, run: async () => { setShowAll(false); await i.run(); } }))}</ul>
        </Sheet>
      )}
    </section>
  );
}
