import { Avatar, Icon, Segmented, SideMenu, SideMenuItem } from '../ds';
import { needsConfirm, useRecurring } from '../lib/recurring';
import { goTop, useApp } from '../store';

/** Menu destinations: the key is the route; `match` lists other routes that light the same item. */
export const MENU = [
  { k: '', label: 'Inicio', icon: 'house', match: ['', 'movimientos'] },
  { k: 'cuentas', label: 'Cuentas', icon: 'cards', match: ['cuentas', 'patrimonio'] },
  { k: 'categorias', label: 'Presupuesto', icon: 'pie', match: ['categorias', 'analisis', 'presupuesto'] },
  { k: 'tendencias', label: 'Mis finanzas', icon: 'chart', match: ['tendencias'] },
  { k: 'recurrentes', label: 'Recurrentes', icon: 'repeat', match: ['recurrentes'] },
] as const;

/** Routes that live under the menu (top-level pages): everything else is a sub-page with a back arrow. */
export const MENU_ROUTES = new Set<string>([...MENU.flatMap((m) => m.match), 'ajustes']);

export function usePendingCount() {
  const { space, accounts } = useApp();
  const { items } = useRecurring(space?.id);
  return items.filter((r) => needsConfirm(r, accounts)).length;
}

/**
 * What the phone menu holds: the destinations, the spaces (one tap to switch) and,
 * at the bottom, the currency and the person, which leads to Ajustes.
 */
export function AppMenu({ route, onClose, menuRef }: { route: string; onClose: () => void; menuRef?: React.Ref<HTMLElement> }) {
  const { spaces, space, setSpaceId, bump, cur, toggleCur, profile } = useApp();
  const pending = usePendingCount();
  const to = (path: string) => {
    onClose();
    goTop(path);
  };
  const isOn = (keys: readonly string[]) => keys.includes(route);

  return (
    <SideMenu
      menuRef={menuRef}
      className="app-menu"
      footer={
        <>
          <div className="app-menu-cur">
            <Segmented label="Ver montos en" value={cur} onChange={(v) => v !== cur && toggleCur()} options={[{ value: 'CRC', label: '¢ Colones' }, { value: 'USD', label: '$ Dólares' }]} />
          </div>
          <SideMenuItem
            leading={<Avatar emoji={profile?.emoji || undefined} initial={(profile?.name || 'U').charAt(0).toUpperCase()} size={32} color="gray" />}
            label={profile?.name || 'Perfil'}
            detail="Ajustes"
            trailing={<Icon name="gear" size={16} />}
            active={route === 'ajustes'}
            onClick={() => to('/ajustes')}
            ariaLabel={`Ajustes, ${profile?.name || 'perfil'}`}
          />
        </>
      }
    >
      {MENU.map((m) => (
        <SideMenuItem
          key={m.k}
          icon={m.icon}
          label={m.label}
          active={isOn(m.match)}
          count={m.k === 'recurrentes' && pending > 0 ? pending : undefined}
          onClick={() => to(`/${m.k}`)}
          ariaLabel={m.k === 'recurrentes' && pending > 0 ? `Recurrentes, ${pending} por confirmar` : undefined}
        />
      ))}

      {spaces.length > 1 && (
        <SideMenu.Section title="Espacios">
          {spaces.map((s) => {
            const on = s.id === space?.id;
            return (
              <SideMenuItem
                key={s.id}
                leading={<Avatar emoji={s.emoji} size={32} color={s.kind === 'shared' ? 'mint' : 'sky'} />}
                label={s.name}
                detail={s.kind === 'shared' ? 'Compartido' : 'Solo vos'}
                trailing={on ? <Icon name="check" size={16} stroke={2.4} /> : undefined}
                ariaLabel={on ? `${s.name}, espacio actual` : `Cambiar a ${s.name}`}
                onClick={() => {
                  if (!on) {
                    setSpaceId(s.id);
                    bump();
                  }
                  onClose();
                }}
              />
            );
          })}
        </SideMenu.Section>
      )}
    </SideMenu>
  );
}
