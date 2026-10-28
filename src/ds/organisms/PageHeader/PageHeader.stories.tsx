import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { PageHeader } from './PageHeader';
import { Button } from '../../atoms/Button/Button';
import { Icon } from '../../atoms/Icon/Icon';

const meta: Meta = { title: 'Organismos/PageHeader' };
export default meta;

const add = <Button variant="secondary" size="xs" iconOnly aria-label="Agregar"><Icon name="plus" size={16} solid /></Button>;

export const Variantes: StoryObj = {
  render: () => (
    <div style={{ maxWidth: 390, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title="Cuentas" actions={add} />
      <PageHeader title="Recurrentes" onBack={() => {}} actions={add} />
      <PageHeader title="Ajustes" onBack={() => {}} />
    </div>
  ),
};
