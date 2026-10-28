import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { Avatar } from './Avatar';

const meta: Meta<typeof Avatar> = {
  title: 'Átomos/Avatar', component: Avatar, tags: ['autodocs'],
  args: { emoji: '🛒', color: 'mint', size: 'md' },
  argTypes: { color: { control: 'select', options: ['mint', 'peach', 'sky', 'butter', 'lilac', 'pink', 'cyan', 'gray'] }, size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] } },
  parameters: { docs: { description: { component: 'Cuadrado redondeado: radio xl hasta 32 px, 2xl desde 40. Emoji sobre el color de la categoría, logo del comercio o inicial.' } } },
};
export default meta;
export const Playground: StoryObj<typeof Avatar> = {};
const LOGO = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="white"/><text x="20" y="27" font-family="Arial" font-size="18" font-weight="700" text-anchor="middle" fill="black">am</text></svg>');
export const Tipos: StoryObj = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {(['sm', 'md', 'lg'] as const).map((s) => (
        <div key={s} className="ds-doc-row">
          <span className="ds-label">{s}</span>
          <Avatar emoji="🛒" color="mint" size={s} />
          <Avatar emoji="🍔" color="peach" size={s} />
          <Avatar img={LOGO} size={s} />
          <Avatar initial="K" size={s} />
          <Avatar img={LOGO} badge={LOGO} size={s} />
        </div>
      ))}
    </div>
  ),
};
