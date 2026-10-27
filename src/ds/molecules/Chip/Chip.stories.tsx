import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useState } from 'react';
import { Chip } from './Chip';

const meta: Meta<typeof Chip> = { title: 'Moléculas/Chip', component: Chip, tags: ['autodocs'], args: { children: 'Comida', size: 'md', trailing: 'none' }, argTypes: { trailing: { control: 'inline-radio', options: ['none', 'remove', 'chevron'] } } };
export default meta;
export const Playground: StoryObj<typeof Chip> = {};
export const Variantes: StoryObj = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {(['sm', 'md', 'lg'] as const).map((s) => (
        <div key={s} className="ds-row">
          <span className="ds-label">{s}</span>
          <Chip size={s}>Comida</Chip><Chip size={s} selected>Comida</Chip>
          <Chip size={s} trailing="remove" selected onRemove={() => {}}>🍔 Comida</Chip>
          <Chip size={s} trailing="chevron">Este mes</Chip>
        </div>
      ))}
    </div>
  ),
};
export const Filtros: StoryObj = {
  render: () => {
    const [on, setOn] = useState(['gastos']);
    const all = ['gastos', 'ingresos', 'por revisar', 'recurrentes'];
    return <div className="ds-row">{all.map((k) => <Chip key={k} selected={on.includes(k)} count={k === 'por revisar' ? 2 : undefined} onClick={() => setOn((v) => (v.includes(k) ? v.filter((x) => x !== k) : [...v, k]))}>{k}</Chip>)}</div>;
  },
};
