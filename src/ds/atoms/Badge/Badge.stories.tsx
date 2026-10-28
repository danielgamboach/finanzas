import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { Badge } from './Badge';

const meta: Meta<typeof Badge> = { title: 'Átomos/Badge', component: Badge, tags: ['autodocs'], args: { count: 3 } };
export default meta;
export const Playground: StoryObj<typeof Badge> = {};
export const Tipos: StoryObj = { render: () => <div className="ds-doc-row"><Badge count={2} /><Badge count={12} /><Badge dot aria-label="Pendiente" /></div> };
