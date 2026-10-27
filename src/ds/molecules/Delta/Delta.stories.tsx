import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { Delta } from './Delta';
import { Stat } from '../Stat/Stat';

const meta: Meta = { title: 'Moléculas/Delta y Stat' };
export default meta;
export const Delta_: StoryObj = { name: 'Delta', render: () => <div className="ds-row"><Delta value="12%" tone="good" direction="down" /><Delta value="12%" tone="bad" direction="up" /><Delta variant="text" value="+12%" tone="good" /><Delta variant="text" value="−8%" tone="bad" /></div> };
export const Stat_: StoryObj = { name: 'Stat', render: () => <div className="ds-row" style={{ gap: 40 }}><Stat label="Gastado este mes" value="¢412.300" delta={<Delta value="12%" tone="bad" direction="up" />} /><Stat size="lg" label="Patrimonio neto" value="¢6.539.890" /></div> };
