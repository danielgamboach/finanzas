import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { Bone, Grabber, Kbd, Separator, Skeleton, Spinner } from './Utility';

const meta: Meta = { title: 'Átomos/Utilidades' };
export default meta;
export const Todas: StoryObj = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 320 }}>
      <div className="ds-doc-row"><span className="ds-label">Kbd</span><Kbd>K</Kbd><Kbd>N</Kbd></div>
      <div className="ds-doc-row"><span className="ds-label">Grabber</span><Grabber /></div>
      <div className="ds-doc-row"><span className="ds-label">Spinner</span><Spinner /></div>
      <div><span className="ds-label">Separator</span><Separator /></div>
      <div><span className="ds-label">Skeleton</span><Skeleton /></div>
      <div><span className="ds-label">Bone</span><span style={{ display: 'flex', gap: 12, alignItems: 'center' }}><Bone width={40} height={40} radius="2xl" /><Bone width={120} height={14} /><Bone width={64} height={28} radius="lg" /></span></div>
    </div>
  ),
};
