import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { Input } from './Input';

const meta: Meta<typeof Input> = { title: 'Átomos/Input', component: Input, tags: ['autodocs'], args: { placeholder: 'Ej. Feria, SINPE a Juan' } };
export default meta;
export const Playground: StoryObj<typeof Input> = {};
export const Estados: StoryObj = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 358 }}>
      <Input placeholder="Ej. Feria, SINPE a Juan" />
      <Input defaultValue="Feria del agricultor" />
      <Input icon="search" placeholder="Con ícono" />
      <Input invalid defaultValue="Algo mal" />
      <Input disabled placeholder="Deshabilitado" />
    </div>
  ),
};
