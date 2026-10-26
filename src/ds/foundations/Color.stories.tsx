import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import tokens from '../../../tokens/tokens.json';

const sem = tokens.semantic;
const names = Object.keys(sem.dark);
const statics = Object.keys(sem.static);

const GROUPS: [string, (n: string) => boolean][] = [
  ['Superficies', (n) => ['background', 'card', 'popover', 'secondary', 'secondary-on-card', 'muted', 'accent', 'sidebar', 'sidebar-accent', 'overlay'].includes(n)],
  ['Texto', (n) => n.endsWith('foreground') && !/destructive|success|warning|highlight|ai|primary/.test(n)],
  ['Acción y bordes', (n) => ['primary', 'primary-foreground', 'border', 'input', 'ring'].includes(n)],
  ['Estados', (n) => /^(destructive|success|warning)/.test(n)],
  ['Destacados y Kai', (n) => /^(highlight|ai)/.test(n)],
  ['Gráficos', (n) => n.startsWith('chart-')],
];

/** Reads the hex/alias behind a token so the swatch shows where it comes from. */
const source = (name: string, mode: 'dark' | 'light') => {
  const light = sem.light as Record<string, string>;
  const dark = { ...sem.dark, ...sem.static } as Record<string, string>;
  return mode === 'light' ? light[name] ?? dark[name] : dark[name];
};

function Swatch({ name, mode }: { name: string; mode: 'dark' | 'light' }) {
  return (
    <div className="ds-swatch">
      <span className="ds-chip" style={{ background: `var(--${name})` }} />
      <span style={{ minWidth: 0 }}>
        <div className="ds-name">{name}</div>
        <div className="ds-meta">var(--{name}) · {source(name, mode)}</div>
      </span>
    </div>
  );
}

function Panel({ mode }: { mode: 'dark' | 'light' }) {
  return (
    <div className={mode === 'light' ? 'light ds-panel' : 'theme-dark ds-panel'}>
      <h2>{mode === 'light' ? 'Claro (hojas y drawers)' : 'Oscuro (app)'}</h2>
      {GROUPS.map(([title, test]) => (
        <section key={title} className="ds-section">
          <div className="ds-name" style={{ color: 'var(--secondary-foreground)' }}>{title}</div>
          <div className="ds-grid">{names.filter(test).map((n) => <Swatch key={n} name={n} mode={mode} />)}</div>
        </section>
      ))}
    </div>
  );
}

const meta: Meta = { title: 'Fundamentos/Color', parameters: { layout: 'fullscreen' } };
export default meta;

export const Semanticos: StoryObj = {
  name: 'Semánticos',
  render: () => (
    <div className="ds-doc">
      <h1>Color</h1>
      <p>Tokens estilo shadcn sobre la paleta de Tailwind v4.1. Mismo nombre en Figma con / en vez de - (color/card-foreground ↔ var(--card-foreground)). Los dos modos se muestran juntos sin importar el selector de arriba.</p>
      <div className="ds-modes"><Panel mode="dark" /><Panel mode="light" /></div>
    </div>
  ),
};

export const Datos: StoryObj = {
  render: () => (
    <div className="ds-doc">
      <h1>Colores de datos</h1>
      <p>Los eligen las personas: categorías (pastel y fuerte) y tarjetas de cuenta. Iguales en los dos modos.</p>
      <h2>Categorías</h2>
      <div className="ds-row">
        {statics.filter((n) => /^category-[a-z]+$/.test(n) && n !== 'category-foreground').map((n) => (
          <div key={n} style={{ width: 132, padding: 14, borderRadius: 'var(--radius-3xl)', background: `var(--${n}-subtle)`, color: 'var(--category-foreground)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ width: 32, height: 32, borderRadius: 'var(--radius-full)', background: `var(--${n})` }} />
            <span className="type-label-sm">{n.replace('category-', '')}</span>
            <span className="type-caption">{n}</span>
          </div>
        ))}
      </div>
      <h2>Cuentas</h2>
      <div className="ds-row">
        {statics.filter((n) => /^account-[a-z]+$/.test(n)).map((n) => (
          <div key={n} style={{ width: 160, height: 100, padding: 14, borderRadius: 'var(--radius-2xl)', background: `var(--${n})`, color: `var(--${n}-foreground)`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <span className="type-label-sm">{n.replace('account-', '')}</span>
            <span className="type-heading-h3">¢318.084</span>
          </div>
        ))}
      </div>
    </div>
  ),
};

export const Primitivos: StoryObj = {
  render: () => {
    const color = tokens.primitives.color as Record<string, Record<string, string> | string>;
    return (
      <div className="ds-doc">
        <h1>Paleta (Tailwind v4.1)</h1>
        <p>Primitivos. En componentes se usan los semánticos; estos existen para construirlos.</p>
        {Object.entries(color).filter(([, v]) => typeof v === 'object').map(([fam, steps]) => (
          <div key={fam} className="ds-row" style={{ gap: 4 }}>
            <span className="ds-label">{fam}</span>
            {Object.keys(steps as Record<string, string>).map((s) => (
              <span key={s} title={`--color-${fam}-${s}`} style={{ width: 56, height: 40, borderRadius: 'var(--radius-md)', background: `var(--color-${fam}-${s})`, display: 'grid', placeItems: 'end start', padding: 4, fontSize: 'var(--text-xs)', color: Number(s) >= 500 ? 'var(--color-white)' : 'var(--color-neutral-900)' }}>{s}</span>
            ))}
          </div>
        ))}
      </div>
    );
  },
};
