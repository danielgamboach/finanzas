import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useState } from 'react';
import { SpendChart, type SpendChartBar } from './SpendChart';

const meta: Meta = { title: 'Organismos/SpendChart' };
export default meta;

const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const seed = [8, 60, 14, 22, 100, 10, 100, 4, 6, 18, 30, 6, 100, 5, 20, 4, 6, 100, 7, 5, 4, 16, 30, 6, 5, 100, 6, 20, 5, 100, 4];
const month: SpendChartBar[] = seed.map((v, i) => ({ value: i < 27 ? v * 2000 : null, prev: ((v * 7) % 90) * 2000, title: `Martes ${i + 1} oct`, curLabel: 'Este mes', prevLabel: `Dom ${i + 1} sep` }));
const ranges = [['D', 'Día'], ['S', 'Semana'], ['M', 'Mes'], ['6M', 'Semestre'], ['1A', 'Año']].map(([value, label]) => ({ value, label }));

export const Mes: StoryObj = {
  name: 'Mes (por defecto)',
  render: () => {
    const [r, setR] = useState('M');
    return <div style={{ maxWidth: 342, paddingTop: 120 }}><SpendChart bars={month} format={fmt} unit="CRC" ranges={ranges} range={r} onRange={setR} ends={['1 oct', '31 oct']} /></div>;
  },
};

const day: SpendChartBar[] = Array.from({ length: 48 }, (_, i) => ({ value: i < 30 ? ((i * 37) % 11 > 7 ? ((i * 13) % 9) * 3000 : 0) : null, prev: (i * 29) % 13 > 9 ? ((i * 7) % 5) * 4000 : 0, title: 'Hoy, martes 27 oct', sub: `${Math.floor(i / 2)}:${i % 2 ? '30' : '00'} a ${Math.floor((i + 1) / 2)}:${(i + 1) % 2 ? '30' : '00'}`, curLabel: 'Hoy', prevLabel: 'Ayer' }));
export const Dia: StoryObj = {
  name: 'Día (cada 30 min)',
  render: () => {
    const [r, setR] = useState('D');
    return <div style={{ maxWidth: 342, paddingTop: 120 }}><SpendChart bars={day} format={fmt} unit="CRC" ranges={ranges} range={r} onRange={setR} ends={['0:00', '24:00']} /></div>;
  },
};
