import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { Logo } from './Logo';

const meta: Meta<typeof Logo> = {
  title: 'Átomos/Logo', component: Logo, tags: ['autodocs'],
  args: { size: 'md' },
  argTypes: { size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] } },
  parameters: { docs: { description: { component: 'Kai Finance: la marca (el mismo archivo del favicon) y el nombre, "Kai" en bold y "Finance" en light.' } } },
};
export default meta;
export const Playground: StoryObj<typeof Logo> = {};
export const Tamanos: StoryObj = {
  name: 'Tamaños',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}>
      <Logo size="sm" />
      <Logo size="md" />
      <Logo size="lg" />
      <Logo size="md" markOnly />
    </div>
  ),
};
