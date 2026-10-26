import type { Preview } from '@storybook/react-vite';
import React from 'react';
import '../src/tokens.css';
import '../src/styles.css';
import '../src/ds/ds.css';

// Oscuro is the app default; Claro is what sheets and drawers use (the `.light` scope).
const preview: Preview = {
  globalTypes: {
    mode: {
      description: 'Modo del sistema',
      toolbar: {
        title: 'Modo',
        icon: 'contrast',
        items: [
          { value: 'oscuro', title: 'Oscuro (app)' },
          { value: 'claro', title: 'Claro (hojas)' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { mode: 'oscuro' },
  parameters: {
    layout: 'fullscreen',
    controls: { expanded: true },
    options: { storySort: { order: ['Fundamentos', 'Átomos', 'Moléculas', 'Organismos'] } },
  },
  decorators: [
    (Story, ctx) => (
      <div className={ctx.globals.mode === 'claro' ? 'light ds-canvas' : 'ds-canvas'}>
        <Story />
      </div>
    ),
  ],
};

export default preview;
