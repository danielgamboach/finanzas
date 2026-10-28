import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { ChartSkeleton, FormSkeleton, GroupSkeleton, Loader, SummarySkeleton, TxListSkeleton } from './Skeletons';

const meta: Meta = { title: 'Moléculas/Skeletons' };
export default meta;

export const Pantalla: StoryObj = {
  render: () => (
    <div style={{ maxWidth: 390, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Loader>
        <SummarySkeleton action />
        <ChartSkeleton />
        <GroupSkeleton rows={2} action value={false} />
        <GroupSkeleton rows={3} leading="icon" />
        <GroupSkeleton rows={2} below />
      </Loader>
    </div>
  ),
};

export const Movimientos: StoryObj = {
  render: () => <div style={{ maxWidth: 390 }}><Loader><TxListSkeleton /></Loader></div>,
};

export const Formulario: StoryObj = {
  render: () => <div style={{ maxWidth: 390 }}><Loader><FormSkeleton /></Loader></div>,
};
