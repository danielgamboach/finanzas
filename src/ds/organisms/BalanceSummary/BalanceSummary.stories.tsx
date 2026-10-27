import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { BalanceSummary } from './BalanceSummary';
import { Button } from '../../atoms/Button/Button';
import { Icon } from '../../atoms/Icon/Icon';

const meta: Meta = { title: 'Organismos/BalanceSummary' };
export default meta;
const add = <Button variant="primary" size="sm" leading={<Icon name="plusCircle" size={18} />}>Gasto</Button>;
export const Estados: StoryObj = {
  render: () => (
    <div className="ds-row" style={{ alignItems: 'flex-start', gap: 48 }}>
      <BalanceSummary label="Disponible en octubre" value="¢312.450" delta={{ text: '+12%', good: true }} action={add} />
      <BalanceSummary label="Te pasaste del presupuesto" value="−¢56.200" negative delta={{ text: '−8%', good: false }} action={add} />
      <BalanceSummary label="Gastado en octubre" value="¢487.900" delta={{ text: '+5%', good: false }} action={add} />
    </div>
  ),
};
