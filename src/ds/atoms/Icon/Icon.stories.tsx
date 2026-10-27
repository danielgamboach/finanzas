import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { Icon, ICON_NAMES, UICON } from './Icon';

const meta: Meta<typeof Icon> = {
  title: 'Átomos/Icon',
  component: Icon,
  tags: ['autodocs'],
  args: { name: 'home', size: 24, stroke: 2 },
  argTypes: {
    name: { control: 'select', options: ICON_NAMES },
    stroke: { control: { type: 'range', min: 1, max: 3, step: 0.1 }, description: 'Menos de 2.4 usa Regular; 2.4 o más usa Bold.' },
  },
  parameters: {
    docs: {
      description: {
        component:
          'Todos los íconos del app vienen de **Flaticon UIcons**, estilo Rounded. `Regular` es el peso normal y `Bold` el de énfasis (checks, cerrar, flechas en botones), que se elige con `stroke` ≥ 2.4. ' +
          'No se dibujan íconos a mano ni se usan caracteres como ✕ o ↑: si falta uno, se agrega en `scripts/uicons.py` (nombre del app → nombre en UIcons) y se corre el script. ' +
          'Toman el color del texto (`currentColor`). Licencia gratis con atribución: el crédito "Uicons by Flaticon" vive al pie de Ajustes y no se quita.',
      },
    },
  },
};
export default meta;

export const Playground: StoryObj<typeof Icon> = {};

const tile: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 16, borderRadius: 'var(--radius-2xl)', background: 'var(--card)' };

export const Todos: StoryObj = {
  render: () => (
    <div className="ds-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
      {ICON_NAMES.map((n) => (
        <div key={n} style={tile}>
          <Icon name={n} size={24} />
          <span className="ds-meta">{n}</span>
          <span className="ds-meta">fi-rr-{UICON[n]}</span>
        </div>
      ))}
    </div>
  ),
};

export const RegularYBold: StoryObj = {
  name: 'Regular y Bold',
  render: () => (
    <div className="ds-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
      {ICON_NAMES.map((n) => (
        <div key={n} style={tile}>
          <span style={{ display: 'flex', gap: 16 }}>
            <Icon name={n} size={24} />
            <Icon name={n} size={24} stroke={2.4} />
          </span>
          <span className="ds-meta">{n}</span>
        </div>
      ))}
    </div>
  ),
};

export const Tamanos: StoryObj = {
  name: 'Tamaños',
  render: () => (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24 }}>
      {[12, 14, 16, 18, 20, 24, 32].map((s) => (
        <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <Icon name="home" size={s} />
          <span className="ds-meta">{s}</span>
        </div>
      ))}
    </div>
  ),
};

export const Atribucion: StoryObj = {
  name: 'Atribución',
  render: () => (
    <div className="ds-doc">
      <p>Así va en el app, al final de Ajustes. Es obligatorio mientras se use la licencia gratuita.</p>
      <footer className="credits">
        Uicons by <a href="https://www.flaticon.com/uicons" target="_blank" rel="noopener noreferrer">Flaticon</a>
      </footer>
    </div>
  ),
};
