import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useState } from 'react';
import { TabBar } from './TabBar';

const meta: Meta = { title: 'Organismos/TabBar' };
export default meta;
const ITEMS = [{ icon: 'grid', label: 'Análisis' }, { icon: 'house', label: 'Inicio' }, { icon: 'cards', label: 'Cuentas' }];
export const Interactiva: StoryObj = { render: () => { const [i, setI] = useState(1); return <TabBar items={ITEMS} active={i} onSelect={setI} />; } };
