import { useState } from 'react';
import { needsConfirm, useRecurring } from '../lib/recurring';
import { go, useApp } from '../store';
import { Emo, Icon, Segmented, Sheet } from '.';
import { ListGroup, ListRow, ProfileButton as ProfileButtonView } from '../ds';

/** "🌱 Simbiosis ⌄": the current space; opens the profile menu (profile, spaces, settings). */
export function ProfileButton() {
  const { profile, space, accounts } = useApp();
  const [open, setOpen] = useState(false);
  const { items } = useRecurring(space?.id);
  const pending = items.filter((r) => needsConfirm(r, accounts)).length;
  return (
    <>
      <ProfileButtonView
        emoji={space?.emoji || profile?.emoji || (profile?.name || 'U').charAt(0).toUpperCase()}
        name={space?.name || profile?.name || 'Perfil'}
        dot={pending > 0}
        dotLabel={`${pending} pagos por confirmar`}
        onClick={() => setOpen(true)}
      />
      {open && <ProfileSheet onClose={() => setOpen(false)} pending={pending} />}
    </>
  );
}

function ProfileSheet({ onClose, pending }: { onClose: () => void; pending: number }) {
  const { spaces, space, setSpaceId, bump, cur, toggleCur } = useApp();
  const to = (path: string) => {
    onClose();
    go(path);
  };
  return (
    <Sheet title="Perfil" onClose={onClose}>
      <ListGroup title="Espacio">
        {spaces.map((s) => {
          const on = s.id === space?.id;
          return (
            <ListRow
              key={s.id}
              leading={<Emo e={s.emoji} color={s.kind === 'shared' ? 'mint' : 'sky'} size={40} />}
              title={s.name}
              detail={s.kind === 'shared' ? 'Compartido' : 'Solo vos'}
              actions={on ? <span className="set-check" aria-label="Espacio actual"><Icon name="check" size={16} stroke={2.4} /></span> : undefined}
              onClick={on ? onClose : () => { setSpaceId(s.id); bump(); onClose(); }}
              label={on ? `${s.name}, espacio actual` : `Cambiar a ${s.name}`}
            />
          );
        })}
      </ListGroup>

      <ListGroup title="Ver montos en">
        <div className="group-pad">
          <Segmented value={cur} options={[['CRC', '¢ Colones'], ['USD', '$ Dólares']]} onChange={(v) => v !== cur && toggleCur()} dark={false} />
        </div>
      </ListGroup>

      <ListGroup>
        <ListRow leading={<ListRow.Icon name="repeat" />} title="Recurrentes" detail={pending > 0 ? `${pending} por confirmar` : 'Pagos fijos y suscripciones'} detailTone={pending > 0 ? 'warning' : 'muted'} chevron onClick={() => to('/recurrentes')} />
        <ListRow leading={<ListRow.Icon name="gear" />} title="Ajustes" detail="Notificaciones, espacios, vouchers" chevron onClick={() => to('/ajustes')} />
      </ListGroup>
    </Sheet>
  );
}
