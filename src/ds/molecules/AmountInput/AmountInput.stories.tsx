import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useState } from 'react';
import { AmountInput } from './AmountInput';

const meta: Meta = { title: 'Moléculas/AmountInput' };
export default meta;
export const Tamanos: StoryObj = { name: 'Tamaños', render: () => <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 358 }}><AmountInput placeholder="0" defaultValue="12.500" /><AmountInput size="small" placeholder="0" defaultValue="77.660" /></div> };
export const Formulario: StoryObj = {
  name: 'Formulario (display)',
  render: () => {
    const [v, setV] = useState('100.000');
    const [cur, setCur] = useState('CRC');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 358 }}>
        <AmountInput size="display" placeholder="0" value={v} onChange={(e) => setV(e.target.value)} unit={cur} onUnit={() => setCur((c) => (c === 'CRC' ? 'USD' : 'CRC'))} unitLabel="Cambiar moneda" />
        <AmountInput size="display" placeholder="0" value="" readOnly unit="CRC" />
        <AmountInput size="display" placeholder="0" value="1.250.000,50" readOnly unit="CRC" positive />
      </div>
    );
  },
};
