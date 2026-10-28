import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { Grabber, Kbd, Separator, Skeleton, Spinner } from './Utility';

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
    </div>
  ),
};
