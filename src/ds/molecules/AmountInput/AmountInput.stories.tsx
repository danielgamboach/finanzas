import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { AmountInput } from './AmountInput';

const meta: Meta = { title: 'Moléculas/AmountInput' };
export default meta;
export const Tamanos: StoryObj = { name: 'Tamaños', render: () => <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 358 }}><AmountInput placeholder="0" defaultValue="12.500" /><AmountInput size="small" placeholder="0" defaultValue="77.660" /></div> };
