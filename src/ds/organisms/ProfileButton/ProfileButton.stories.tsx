import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { ProfileButton } from './ProfileButton';
import { KaiButton } from '../KaiButton/KaiButton';
import { HomeHeader } from '../HomeHeader/HomeHeader';

const meta: Meta = { title: 'Organismos/Barra de Inicio' };
export default meta;
export const ProfileButton_: StoryObj = { name: 'ProfileButton', render: () => <div className="ds-row"><ProfileButton emoji="🦥" name="Dani G" space="👫 Simbiosis" dot dotLabel="2 pagos por confirmar" /><ProfileButton emoji="🌻" name="Kimmy" space="🌻 Personal" /></div> };
export const KaiButton_: StoryObj = { name: 'KaiButton', render: () => <div className="ds-row"><KaiButton /><KaiButton type="chip" /></div> };
export const HomeHeader_: StoryObj = { name: 'HomeHeader', render: () => <div style={{ maxWidth: 352 }}><HomeHeader><ProfileButton emoji="🦥" name="Dani G" space="👫 Simbiosis" dot /><KaiButton /></HomeHeader></div> };
