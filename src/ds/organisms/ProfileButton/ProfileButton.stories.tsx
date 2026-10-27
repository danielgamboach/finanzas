import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { ProfileButton } from './ProfileButton';
import { KaiButton } from '../KaiButton/KaiButton';
import { HomeHeader, HomeHeaderButton } from '../HomeHeader/HomeHeader';

const meta: Meta = { title: 'Organismos/Barra de Inicio' };
export default meta;
export const ProfileButton_: StoryObj = { name: 'ProfileButton', render: () => <div className="ds-row"><ProfileButton emoji="🌱" name="Simbiosis" dot dotLabel="2 pagos por confirmar" /><ProfileButton emoji="🦥" name="Personal" color="lilac-subtle" /></div> };
export const KaiButton_: StoryObj = { name: 'KaiButton', render: () => <div className="ds-row"><KaiButton /><KaiButton type="chip" /></div> };
export const HomeHeader_: StoryObj = { name: 'HomeHeader', render: () => <div style={{ maxWidth: 390 }}><HomeHeader actions={<><HomeHeaderButton icon="plus" label="Agregar gasto" /><KaiButton /></>}><ProfileButton emoji="🌱" name="Simbiosis" dot /></HomeHeader></div> };
