import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useState } from 'react';
import { SpendChart, type SpendChartBar } from './SpendChart';

const meta: Meta = { title: 'Organismos/SpendChart' };
export default meta;

const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const seed = [8, 60, 14, 22, 100, 10, 100, 4, 6, 18, 30, 6, 100, 5, 20, 4, 6, 100, 7, 5, 4, 16, 30, 6, 5, 100, 6, 20, 5, 100, 4];
const month: SpendChartBar[] = seed.map((v, i) => ({ value: i < 27 ? v * 2000 : null, prev: ((v * 7) % 90) * 2000, title: `Día ${i + 1}`, curLabel: 'Oct', prevLabel: 'Sep' }));
const ranges = ['D', 'S', 'M', '6M', '1A', 'YTD'].map((x) => ({ value: x, label: x }));

export const Mes: StoryObj = {
  name: 'Mes (por defecto)',
  render: () => {
    const [r, setR] = useState('M');
    return <div style={{ maxWidth: 342, paddingTop: 120 }}><SpendChart bars={month} format={fmt} unit="CRC" ranges={ranges} range={r} onRange={setR} /></div>;
  },
};
