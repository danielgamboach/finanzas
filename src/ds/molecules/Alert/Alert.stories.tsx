import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { Alert, type AlertTone } from './Alert';
import { Icon } from '../../atoms/Icon/Icon';

const T: [AlertTone, string][] = [['warning', 'warning'], ['destructive', 'warning'], ['success', 'checkCircle'], ['ai', 'wand'], ['neutral', 'bell']];
const meta: Meta = { title: 'Moléculas/Alert' };
export default meta;
export const Tonos: StoryObj = {
  render: () => (
    <div style={{ display: 'grid', gap: 12, maxWidth: 358 }}>
      {T.map(([t, i]) => <Alert key={t} tone={t} icon={<Icon name={i} size={20} />} title="Comida va en 92%">Te quedan ¢8.000 para el resto del mes.</Alert>)}
      {T.map(([t, i]) => <Alert key={t + 's'} tone={t} size="sm" icon={<Icon name={i} size={16} />}>Comida va en 92% del límite</Alert>)}
    </div>
  ),
};
