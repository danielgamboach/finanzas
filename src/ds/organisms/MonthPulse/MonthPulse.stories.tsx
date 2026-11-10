import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { MonthPulse } from './MonthPulse';

const meta: Meta = { title: 'Organismos/MonthPulse' };
export default meta;
const stats = [{ label: 'Por día', value: '17.173', unit: 'CRC' }, { label: 'Gastado', value: '97.210', unit: 'CRC' }];
export const Estados: StoryObj = {
  render: () => (
    <div className="ds-doc-row" style={{ alignItems: 'flex-start', gap: 48 }}>
      <div style={{ width: 342 }}><MonthPulse label="Libre en noviembre" value="377.800" unit="CRC" used={0.2} today={0.27} start="1 nov" end="30 nov" stats={stats} /></div>
      <div style={{ width: 342 }}><MonthPulse label="Libre en noviembre" value="120.000" unit="CRC" used={0.7} today={0.4} start="1 nov" end="30 nov" stats={stats} /></div>
      <div style={{ width: 342 }}><MonthPulse label="Te pasás este mes" value="15.000" unit="CRC" negative used={1} today={0.8} start="1 nov" end="30 nov" stats={stats} /></div>
    </div>
  ),
};
