import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import tokens from '../../../tokens/tokens.json';

const meta: Meta = { title: 'Fundamentos/Escalas' };
export default meta;

const SAMPLE: Record<string, string> = {
  'display-lg': '¢743.854', 'display-md': '¢859.821', 'display-sm': '−¢569.821', 'heading-h1': 'Movimientos', 'heading-h2': '¢11.673.492',
  'heading-h3': 'Gasto por mes', 'heading-h4': 'Más de ampm', 'body-lg': 'Elegí la categoría y listo.', 'body-sm': 'Kai responde con los datos del espacio.',
  'label-lg': 'Uber Eats', 'label-sm': 'Nuevo gasto', caption: '26 oct · Delivery', 'caption-strong': 'Por revisar',
};

export const Tipografia: StoryObj = {
  name: 'Tipografía',
  render: () => {
    const text = tokens.primitives.text as Record<string, number[]>;
    return (
      <div className="ds-doc">
        <h1>Tipografía</h1>
        <p>Inter. Cada rol es un estilo de texto en Figma (Heading/H1) y una clase en código (.type-heading-h1).</p>
        <table className="ds-table">
          <thead><tr><th>Rol</th><th>Muestra</th><th>Tamaño</th></tr></thead>
          <tbody>
            {Object.entries(tokens.typography).map(([role, [size, weight, track]]) => (
              <tr key={role}>
                <td><div className="ds-name">.type-{role}</div><div className="ds-meta">{weight} · tracking-{track}</div></td>
                <td className={`type-${role}`}>{SAMPLE[role]}</td>
                <td className="ds-meta">text-{size} · {text[size][0]}/{text[size][1]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  },
};

const USE: Record<string, string> = { '2xl': 'filas, menús', '3xl': 'tarjetas', '4xl': 'hojas', full: 'botones, chips, avatares' };

export const Radios: StoryObj = {
  render: () => (
    <div className="ds-doc">
      <h1>Radios</h1>
      <p>Todo lo que es píldora o círculo usa full, sin importar su alto.</p>
      <div className="ds-row" style={{ alignItems: 'flex-end', gap: 24 }}>
        {Object.entries(tokens.primitives.radius).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ width: 96, height: 96, background: 'var(--card)', borderRadius: `var(--radius-${k})`, boxShadow: 'inset 0 0 0 1px var(--border)' }} />
            <span className="ds-name">radius-{k}</span>
            <span className="ds-meta">{k === 'full' ? '9999' : v}px{USE[k] ? ` · ${USE[k]}` : ''}</span>
          </div>
        ))}
      </div>
    </div>
  ),
};

export const Espaciado: StoryObj = {
  render: () => (
    <div className="ds-doc">
      <h1>Espaciado</h1>
      <p>Base de 4 px (--spacing). En CSS se escribe en px, siempre un paso de esta escala; el build lo verifica.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tokens.primitives.spacing.filter((v) => v > 0 && v <= 96).map((v) => (
          <div key={v} className="ds-row">
            <span className="ds-label">{v / 4} · {v}px</span>
            <span style={{ width: v, height: 16, background: 'var(--highlight)', borderRadius: 'var(--radius-xs)' }} />
          </div>
        ))}
      </div>
    </div>
  ),
};
