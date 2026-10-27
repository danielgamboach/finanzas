import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useState } from 'react';
import { SearchField } from './SearchField';

const meta: Meta = { title: 'Moléculas/SearchField' };
export default meta;
export const Tamanos: StoryObj = {
  name: 'Tamaños',
  render: () => {
    const [a, setA] = useState('');
    const [b, setB] = useState('uber');
    return <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 358 }}><SearchField value={a} onChange={setA} placeholder="Buscar movimientos" /><SearchField size="md" value={b} onChange={setB} /></div>;
  },
};
