import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { Alert, type AlertTone } from './Alert';

const T: [AlertTone, string][] = [['warning', '⚠️'], ['destructive', '🚨'], ['success', '🎉'], ['ai', '✨'], ['neutral', '💡']];
const meta: Meta = { title: 'Moléculas/Alert' };
export default meta;
export const Tonos: StoryObj = {
  render: () => (
    <div style={{ display: 'grid', gap: 12, maxWidth: 358 }}>
      {T.map(([t, i]) => <Alert key={t} tone={t} icon={i} title="Comida va en 92%">Te quedan ¢8.000 para el resto del mes.</Alert>)}
      {T.map(([t, i]) => <Alert key={t + 's'} tone={t} size="sm" icon={i}>Comida va en 92% del límite</Alert>)}
    </div>
  ),
};
