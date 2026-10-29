import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { ActionBar } from './ActionBar';
import { Button } from '../../atoms/Button/Button';

const meta: Meta = { title: 'Moléculas/ActionBar' };
export default meta;
export const Guardar: StoryObj = {
  render: () => (
    <div style={{ width: 390, height: 420, overflowY: 'auto', background: 'var(--background)', borderRadius: 24, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Array.from({ length: 12 }, (_, i) => <div key={i} style={{ height: 44, borderRadius: 16, background: 'var(--card)' }} />)}
      </div>
      <ActionBar><Button variant="primary" size="lg" block>Guardar</Button></ActionBar>
    </div>
  ),
};
