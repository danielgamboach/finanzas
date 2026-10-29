import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useState } from 'react';
import { RangeWheel } from './RangeWheel';

const meta: Meta = { title: 'Moléculas/RangeWheel' };
export default meta;
const OPTS = [
  { value: 'D', label: 'Día' }, { value: 'S', label: 'Semana' }, { value: 'M', label: 'Mes' }, { value: '6M', label: 'Semestre' }, { value: '1A', label: 'Año' },
];
export const Rangos: StoryObj = {
  render: () => {
    const [v, setV] = useState('M');
    return <div style={{ maxWidth: 342 }}><RangeWheel options={OPTS} value={v} onChange={setV} label="Rango" /><p className="ds-note" style={{ textAlign: 'center' }}>Elegido: {v}</p></div>;
  },
};
