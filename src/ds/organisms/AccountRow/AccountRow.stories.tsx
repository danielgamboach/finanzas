import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { AccountGroup, AccountRow } from './AccountRow';

const meta: Meta = { title: 'Organismos/AccountRow' };
export default meta;

export const Grupos: StoryObj = {
  render: () => (
    <div style={{ maxWidth: 342, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <AccountGroup title="Tarjetas de crédito">
        <AccountRow icon="cards" color="var(--account-yellow)" name="Visa compartida" details={['USD/CRC', 'Crédito', '**7205']} amount="¢350.000" href="#" />
        <AccountRow icon="cards" color="var(--account-cyan)" name="Mastercard" details={['USD/CRC', 'Crédito', '**4417']} amount="¢0" href="#" />
      </AccountGroup>
      <AccountGroup title="Débito y ahorro">
        <AccountRow icon="bank" color="var(--account-emerald)" name="Corriente dólares" details={['USD', 'Débito', '**7205']} amount="2.250 USD" href="#" />
      </AccountGroup>
      <AccountGroup title="Inversión">
        <AccountRow icon="chartHistogram" color="var(--account-emerald)" name="Hapi" details={['USD', 'Inversión']} amount="2.250 USD" delta={{ text: '+$3,51 (+0,15%)', tone: 'positive' }} href="#" />
        <AccountRow icon="lock" color="var(--account-emerald)" name="Multimoney" details={['USD', 'CDP Plazo']} amount="Sin saldo" amountMuted href="#" />
      </AccountGroup>
    </div>
  ),
};
