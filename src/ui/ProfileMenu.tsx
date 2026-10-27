import { useState } from 'react';
import { needsConfirm, useRecurring } from '../lib/recurring';
import { go, useApp } from '../store';
import { Icon, Segmented, Sheet } from '.';
import { Badge, ProfileButton as ProfileButtonView } from '../ds';

/** "🦥 Dani G ⌄" with the current space underneath; opens the profile menu. */
export function ProfileButton() {
  const { profile, space, accounts } = useApp();
  const [open, setOpen] = useState(false);
  const { items } = useRecurring(space?.id);
  const pending = items.filter((r) => needsConfirm(r, accounts)).length;
  return (
    <>
      <ProfileButtonView
        emoji={profile?.emoji || (profile?.name || 'U').charAt(0).toUpperCase()}
        name={profile?.name || 'Perfil'}
        space={space ? `${space.emoji} ${space.name}` : undefined}
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
      <div className="col gap8">
        <span className="field-label">Espacio</span>
        <div className="col gap6">
          {spaces.map((s) => (
            <button
              key={s.id}
              className={s.id === space?.id ? 'space-row on' : 'space-row'}
              aria-pressed={s.id === space?.id}
              onClick={() => {
                setSpaceId(s.id);
                bump();
                onClose();
              }}
            >
              <span className="space-emoji" aria-hidden="true">{s.emoji}</span>
              <span className="grow col">
                <strong className="sm">{s.name}</strong>
                <span className="muted small">{s.kind === 'shared' ? 'Compartido' : 'Solo vos'}</span>
              </span>
              {s.id === space?.id && <Icon name="check" size={18} stroke={2.6} />}
            </button>
          ))}
        </div>
      </div>

      <div className="col gap8">
        <span className="field-label">Ver montos en</span>
        <Segmented value={cur} options={[['CRC', '¢ Colones'], ['USD', '$ Dólares']]} onChange={(v) => v !== cur && toggleCur()} dark={false} />
      </div>

      <div className="menu-list">
        <button className="menu-row" onClick={() => to('/recurrentes')}>
          <span className="menu-ico"><Icon name="repeat" size={18} /></span>
          <span className="grow col"><strong className="sm">Recurrentes</strong><span className="muted small">Pagos fijos y suscripciones</span></span>
          {pending > 0 && <Badge className="count-badge" count={pending} />}
          <Icon name="chevRight" size={18} />
        </button>
        <button className="menu-row" onClick={() => to('/ajustes')}>
          <span className="menu-ico"><Icon name="gear" size={18} /></span>
          <span className="grow col"><strong className="sm">Ajustes</strong><span className="muted small">Notificaciones, fotos, espacios, vouchers</span></span>
          <Icon name="chevRight" size={18} />
        </button>
      </div>
    </Sheet>
  );
}
