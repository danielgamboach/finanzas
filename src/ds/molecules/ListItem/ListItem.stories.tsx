import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { ListItem } from './ListItem';
import { Avatar } from '../../atoms/Avatar/Avatar';
import { Money } from '../../atoms/Money/Money';
import { Button } from '../../atoms/Button/Button';

const meta: Meta = { title: 'Moléculas/ListItem' };
export default meta;
export const Variantes: StoryObj = {
  render: () => (
    <div style={{ maxWidth: 390 }}>
      <ListItem leading={<Avatar emoji="🛒" color="mint" />} title="Automercado" subtitle="Supermercado · hoy" trailing={<Money value="¢23.450" />} />
      <ListItem leading={<Avatar icon="cards" color="lilac" />} title="Visa compartida" subtitle="Por pagar" chevron onClick={() => {}} />
      <ListItem leading={<Avatar emoji="🏠" color="gray" />} title="Alquiler" subtitle="Vence mañana" trailing={<Button variant="outline" size="sm">Pagar</Button>} />
      <ListItem density="sm" leading={<Avatar emoji="👫" color="cyan" size="sm" />} title="Simbiosis" subtitle="Compartido" />
    </div>
  ),
};
