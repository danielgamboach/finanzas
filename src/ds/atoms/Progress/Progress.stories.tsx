import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { Progress } from './Progress';

const meta: Meta<typeof Progress> = { title: 'Átomos/Progress', component: Progress, tags: ['autodocs'], args: { value: 0.6, tone: 'default', size: 'md' } };
export default meta;
export const Playground: StoryObj<typeof Progress> = { render: (a) => <div style={{ maxWidth: 320 }}><Progress {...a} /></div> };
export const Tonos: StoryObj = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 320 }}>
      {(['default', 'success', 'warning', 'destructive'] as const).map((t) => <Progress key={t} value={0.6} tone={t} />)}
      <Progress value={0.48} color="mint" size="lg" marker={0.84} label="Supermercado" />
      <Progress value={0.3} size="sm" />
    </div>
  ),
};
