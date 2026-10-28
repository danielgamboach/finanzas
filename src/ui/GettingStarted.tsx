import { useEffect, useState } from 'react';
import { Button, ListGroup, ListRow, Progress } from '../ds';
import { db } from '../lib/api';
import { enablePush, permission, pushSupport } from '../lib/push';
import { go, useApp } from '../store';
import { shareInvite } from '../screens/Onboarding';
import { Emo, Icon, Sheet } from './index';

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
  const row = (i: Item, go: () => void = () => run(i)) => (
    <ListRow
      key={i.key}
      leading={i.done ? <span className="gs-check on" aria-hidden="true"><Icon name="check" size={14} stroke={3} /></span> : <Emo e={i.emoji} color="gray" size={40} />}
      title={<>{i.title}{i.done && <span className="sr"> (listo)</span>}</>}
      detail={i.done ? 'Listo' : i.sub}
      detailTone={i.done ? 'success' : 'muted'}
      quiet={i.done}
      chevron={!i.done}
      onClick={i.done || busy === i.key ? undefined : go}
    />
  );

  return (
    <ListGroup
      className={variant === 'card' ? 'gs gs-card' : 'gs'}
      title={all ? '¡Terminaste los primeros pasos! 🎉' : `Primeros pasos · ${doneCount} de ${total}`}
      action={all ? <Button variant="primary" size="xs" onClick={hide}>Cerrar</Button> : <Button variant="ghost" size="xs" onClick={hide}>Ocultar</Button>}
      footer={!all && variant === 'sheet' && total > 1 ? <Button variant="ghost" size="xs" onClick={() => setShowAll(true)}>Ver los {total} pasos</Button> : undefined}
    >
      <div className="group-pad"><Progress size="sm" tone="success" value={doneCount / total} label="Primeros pasos completados" /></div>
      {!all && variant === 'card' && items.map((i) => row(i))}
      {!all && variant === 'sheet' && next && row(next)}
      {showAll && (
        <Sheet title="Primeros pasos" onClose={() => setShowAll(false)}>
          <p className="page-text">{doneCount} de {total} listos. Todo es opcional, a tu ritmo.</p>
          <ListGroup>{items.map((i) => row(i, async () => { setShowAll(false); await i.run(); }))}</ListGroup>
        </Sheet>
      )}
    </ListGroup>
  );
}
