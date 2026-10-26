import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { Icon, ICON_NAMES, UICON } from './Icon';

const meta: Meta<typeof Icon> = {
  title: 'Átomos/Icon',
  component: Icon,
  tags: ['autodocs'],
  args: { name: 'home', size: 24, stroke: 2 },
  argTypes: { name: { control: 'select', options: ICON_NAMES } },
};
export default meta;

export const Playground: StoryObj<typeof Icon> = {};

export const Todos: StoryObj = {
  render: () => (
    <div className="ds-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
      {ICON_NAMES.map((n) => (
        <div key={n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 16, borderRadius: 'var(--radius-2xl)', background: 'var(--card)' }}>
          <Icon name={n} size={24} />
          <span className="ds-meta">{n}</span>
          <span className="ds-meta">fi-rr-{UICON[n]}</span>
        </div>
      ))}
    </div>
  ),
};
