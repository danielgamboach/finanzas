import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useState } from 'react';
import { Segmented } from './Segmented';

const meta: Meta = { title: 'Moléculas/Segmented' };
export default meta;
export const Md: StoryObj = { name: 'md · ancho completo', render: () => { const [v, setV] = useState('p'); return <div style={{ maxWidth: 358 }}><Segmented value={v} onChange={setV} options={[{ value: 'p', label: 'Presupuesto' }, { value: 't', label: 'Tendencias' }]} /></div>; } };
export const Sm: StoryObj = { name: 'sm · dentro de tarjetas', render: () => { const [v, setV] = useState('m'); return <Segmented size="sm" value={v} onChange={setV} options={[{ value: 'm', label: 'Monto' }, { value: 'c', label: 'Compras' }]} />; } };
