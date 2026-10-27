import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { Toast } from './Toast';

const meta: Meta = { title: 'Moléculas/Toast' };
export default meta;
export const Tipos: StoryObj = { render: () => <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}><Toast message="Gasto guardado" /><Toast message="8 movimientos a Comida" onUndo={() => {}} /></div> };
