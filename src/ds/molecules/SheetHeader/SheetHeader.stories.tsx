import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { SheetHeader } from './SheetHeader';

const meta: Meta = { title: 'Moléculas/SheetHeader' };
export default meta;
export const Variantes: StoryObj = {
  render: () => (
    <div style={{ display: 'grid', gap: 24, maxWidth: 390 }}>
      <SheetHeader title="Filtros" onClose={() => {}} />
      <SheetHeader title="Filtros" subtitle="Octubre 2026" onClose={() => {}} />
      <SheetHeader layout="center" title="Movimientos" />
    </div>
  ),
};
