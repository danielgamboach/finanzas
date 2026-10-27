import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { PendingPaymentRow, PendingPayments } from './PendingPayments';

const meta: Meta = { title: 'Organismos/PendingPayments' };
export default meta;
export const Bloque: StoryObj = {
  render: () => (
    <div style={{ maxWidth: 358 }}>
      <PendingPayments count={2}>
        <PendingPaymentRow face={{ emoji: '🏠', color: 'gray' }} name="Alquiler" detail="Mañana" amount="¢350.000" onPay={() => {}} payLabel="Ya pagué Alquiler" />
        <PendingPaymentRow state="overdue" face={{ emoji: '💡', color: 'cyan' }} name="Agua AyA" detail="Venció hace 2 días" amount="≈ ¢18.400" onPay={() => {}} payLabel="Ya pagué Agua" />
        <PendingPaymentRow state="done" face={{ emoji: '🌐', color: 'gray' }} name="Internet" detail="Pagado · 24 oct" amount="¢24.900" onUndo={() => {}} />
      </PendingPayments>
    </div>
  ),
};
