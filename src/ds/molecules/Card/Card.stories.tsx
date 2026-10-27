import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { Card } from './Card';
import { Button } from '../../atoms/Button/Button';

const meta: Meta = { title: 'Moléculas/Card' };
export default meta;
export const Superficies: StoryObj = {
  render: () => (
    <div style={{ display: 'grid', gap: 16, maxWidth: 358 }}>
      <Card><div className="ds-row"><span className="type-label-lg">Card</span><Button variant="secondary" size="sm">secondary sube un paso</Button></div></Card>
      <Card surface="muted"><span className="type-label-lg">Muted</span></Card>
      <Card padding="none"><div style={{ padding: 16 }} className="type-body-sm">Sin padding: el contenido llega al borde.</div></Card>
    </div>
  ),
};
