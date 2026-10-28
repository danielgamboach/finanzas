import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { AccountCard, AccountStack } from './AccountCard';

const COLORS = ['graphite', 'emerald', 'cyan', 'yellow', 'violet', 'coral', 'blue', 'sand'];
const meta: Meta = { title: 'Organismos/AccountCard' };
export default meta;
export const Colores: StoryObj = { render: () => <div className="ds-doc-row">{COLORS.map((c) => <AccountCard key={c} color={c} />)}</div> };
export const Stack: StoryObj = { render: () => <AccountStack accounts={[{ color: 'violet' }, { color: 'cyan' }, { color: 'graphite' }]} /> };
