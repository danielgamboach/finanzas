import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useState } from 'react';
import { SideMenu, SideMenuItem, MenuButton } from './SideMenu';
import { Avatar } from '../../atoms/Avatar/Avatar';
import { Button } from '../../atoms/Button/Button';
import { Icon } from '../../atoms/Icon/Icon';
import { Segmented } from '../../molecules/Segmented/Segmented';

const meta: Meta = { title: 'Organismos/SideMenu' };
export default meta;

const NAV = [
  ['house', 'Inicio'], ['list', 'Movimientos'], ['cards', 'Cuentas'], ['pie', 'Categorías'], ['chart', 'Tendencias'], ['repeat', 'Recurrentes'],
] as const;

function Demo() {
  const [on, setOn] = useState('Inicio');
  const [space, setSpace] = useState('s');
  const [cur, setCur] = useState<'CRC' | 'USD'>('CRC');
  return (
    <div style={{ width: 320, height: 760, borderRadius: 24, overflow: 'hidden' }}>
      <SideMenu
        top={<Button variant="secondary" size="md" block leading={<Icon name="plus" size={18} solid />}>Nuevo movimiento</Button>}
        footer={<>
          <Segmented value={cur} onChange={setCur} options={[{ value: 'CRC', label: '¢ Colones' }, { value: 'USD', label: '$ Dólares' }]} label="Ver montos en" />
          <SideMenuItem leading={<Avatar initial="D" size={32} color="sky" />} label="Dani" detail="Ajustes" trailing={<Icon name="gear" size={16} />} />
        </>}
      >
        {NAV.map(([icon, label]) => (
          <SideMenuItem key={label} icon={icon} label={label} active={on === label} count={label === 'Recurrentes' ? 3 : undefined} onClick={() => setOn(label)} />
        ))}
        <SideMenuItem icon="sparkle" label="Preguntale a Kai" />
        <SideMenu.Section title="Espacios">
          {[['s', '👫', 'Simbiosis', 'Compartido', 'mint'], ['p', '🦥', 'Personal', 'Solo vos', 'sky']].map(([id, e, n, d, c]) => (
            <SideMenuItem key={id} leading={<Avatar emoji={e} size={32} color={c} />} label={n} detail={d} active={space === id} trailing={space === id ? <Icon name="check" size={16} stroke={2.4} /> : undefined} onClick={() => setSpace(id)} />
          ))}
        </SideMenu.Section>
      </SideMenu>
    </div>
  );
}

export const Menu: StoryObj = { render: () => <Demo /> };
export const Boton: StoryObj = {
  name: 'MenuButton',
  render: () => (
    <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
      <MenuButton onClick={() => {}} />
      <MenuButton onClick={() => {}} title="Simbiosis" dot dotLabel="3 pagos por confirmar" />
      <MenuButton size="xs" onClick={() => {}} />
    </div>
  ),
};
