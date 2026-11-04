import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { ProgressRing } from './ProgressRing';

const meta: Meta<typeof ProgressRing> = { title: 'Átomos/ProgressRing', component: ProgressRing, tags: ['autodocs'], args: { value: 0.6, tone: 'default', size: 64, children: '🛒' } };
export default meta;
export const Playground: StoryObj<typeof ProgressRing> = {};
export const Tonos: StoryObj = {
  render: () => (
    <div className="ds-doc-row" style={{ gap: 20 }}>
      <ProgressRing value={0.12}>🛒</ProgressRing>
      <ProgressRing value={0.85} tone="warning">🍔</ProgressRing>
      <ProgressRing value={1.2} tone="destructive">🎬</ProgressRing>
      <ProgressRing value={0.4} size={48} thickness={4}>⛽</ProgressRing>
    </div>
  ),
};
