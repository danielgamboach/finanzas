import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { Field } from './Field';
import { Input } from '../../atoms/Input/Input';

const meta: Meta = { title: 'Moléculas/Field' };
export default meta;
export const Estados: StoryObj = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 358 }}>
      <Field label="Nombre" hint="Así lo vas a ver en tus movimientos."><Input placeholder="Ej. Feria" /></Field>
      <Field label="Nombre" error="Poné un nombre para seguir."><Input /></Field>
    </div>
  ),
};
