import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { Tag, type TagTone } from './Tag';

const TONES: TagTone[] = ['neutral', 'warning', 'ai', 'success', 'destructive'];
const meta: Meta<typeof Tag> = { title: 'Átomos/Tag', component: Tag, tags: ['autodocs'], args: { children: 'Por revisar', tone: 'warning', size: 'md' }, argTypes: { tone: { control: 'select', options: TONES } } };
export default meta;
export const Playground: StoryObj<typeof Tag> = {};
export const TonosYTamanos: StoryObj = {
  name: 'Tonos y tamaños',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {(['sm', 'md', 'lg'] as const).map((s) => <div key={s} className="ds-doc-row"><span className="ds-label">{s}</span>{TONES.map((t) => <Tag key={t} tone={t} size={s}>{{ neutral: 'Varía', warning: 'Por revisar', ai: 'IA', success: 'Pagado', destructive: 'Atrasado' }[t]}</Tag>)}</div>)}
    </div>
  ),
};
