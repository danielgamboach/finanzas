import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { RingRail } from './RingRail';

const meta: Meta<typeof RingRail> = { title: 'Moléculas/RingRail', component: RingRail, tags: ['autodocs'] };
export default meta;
export const Limites: StoryObj = {
  name: 'Límites del presupuesto',
  render: () => (
    <div style={{ maxWidth: 360 }}>
      <RingRail label="Límites" items={[
        { key: 'a', name: 'Supermercado', face: '🛒', value: 0.12 },
        { key: 'b', name: 'Delivery', face: '🛵', value: 0.86, tone: 'warning' },
        { key: 'c', name: 'Restaurantes', face: '🍟', value: 1.1, tone: 'destructive' },
        { key: 'd', name: 'Gasolina', face: '⛽', value: 0.4 },
        { key: 'e', name: 'Salidas', face: '🎬', value: 0.2 },
      ]} />
    </div>
  ),
};
