import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { Money } from './Money';

const meta: Meta<typeof Money> = { title: 'Átomos/Money', component: Money, tags: ['autodocs'], args: { value: '¢743.854', size: 'large', tone: 'default' } };
export default meta;
export const Playground: StoryObj<typeof Money> = {};
export const Tamanos: StoryObj = {
  name: 'Tamaños y tonos',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {(['hero', 'large', 'row'] as const).map((s) => (
        <div key={s} className="ds-row"><span className="ds-label">{s}</span><Money size={s} value="¢743.854" /><Money size={s} tone="positive" value="+¢820.000" /><Money size={s} tone="negative" value="−¢569.821" /></div>
      ))}
      <div className="ds-row"><span className="ds-label">con código (Inicio, filas)</span><Money size="large" value="312.450" unit="CRC" /><Money value="23.450" unit="CRC" /><Money tone="positive" value="+850.000" unit="CRC" /></div>
      <div className="ds-row"><span className="ds-label">muted / tachado</span><Money value="¢3.120" tone="muted" /><Money value="¢3.120" tone="muted" strike /></div>
    </div>
  ),
};
