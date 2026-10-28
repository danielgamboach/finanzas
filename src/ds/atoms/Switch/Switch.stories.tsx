import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useState } from 'react';
import { Switch } from './Switch';

const meta: Meta<typeof Switch> = { title: 'Átomos/Switch', component: Switch, tags: ['autodocs'] };
export default meta;
export const Interactivo: StoryObj = { render: () => { const [on, setOn] = useState(true); return <Switch checked={on} onChange={setOn} label="Repetir cada mes" />; } };
export const Estados: StoryObj = { render: () => <div className="ds-doc-row"><Switch checked={false} onChange={() => {}} label="Apagado" /><Switch checked onChange={() => {}} label="Encendido" /><Switch checked disabled onChange={() => {}} label="Deshabilitado" /></div> };
