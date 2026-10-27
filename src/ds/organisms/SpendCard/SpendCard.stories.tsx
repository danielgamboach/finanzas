import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { SpendCard } from './SpendCard';

const meta: Meta = { title: 'Organismos/SpendCard' };
export default meta;
const B = [['🛒', 'mint'], ['🍔', 'peach'], ['🚗', 'sky'], ['☕', 'butter'], ['💊', 'pink'], ['🎬', 'lilac'], ['💡', 'cyan'], ['🏠', 'gray']].map(([emoji, color], i) => ({ key: String(i), emoji, color }));
export const Inicio: StoryObj = { render: () => <div style={{ maxWidth: 326, paddingTop: 12 }}><SpendCard label="Gastado en octubre" value="¢487.900" bubbles={B} /></div> };
