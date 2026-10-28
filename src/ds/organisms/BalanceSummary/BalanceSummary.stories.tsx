import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { BalanceSummary } from './BalanceSummary';

const meta: Meta = { title: 'Organismos/BalanceSummary' };
export default meta;
export const Estados: StoryObj = {
  render: () => (
    <div className="ds-doc-row" style={{ alignItems: 'flex-start', gap: 48 }}>
      <BalanceSummary label="Octubre 2026" value="312.450" unit="CRC" delta={{ value: '12%', good: true, direction: 'down', vs: 'vs Septiembre' }} available={{ value: '102.023', unit: 'CRC' }} />
      <BalanceSummary label="Esta semana" value="84.300" unit="CRC" delta={{ value: '8%', good: false, direction: 'up', vs: 'vs semana pasada' }} available={{ value: '−56.200', unit: 'CRC', negative: true }} />
      <BalanceSummary label="Octubre 2026" value="487.900" unit="CRC" />
    </div>
  ),
};
