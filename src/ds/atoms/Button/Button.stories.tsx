import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { Button, type ButtonSize, type ButtonVariant } from './Button';
import { Icon } from '../Icon/Icon';

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'muted', 'outline', 'ghost', 'link', 'destructive', 'destructive-outline'];
const SIZES: ButtonSize[] = ['xs', 'sm', 'md', 'lg', 'xl'];

const meta: Meta<typeof Button> = {
  title: 'Átomos/Button',
  component: Button,
  tags: ['autodocs'],
  args: { children: 'Nuevo gasto', variant: 'primary', size: 'md' },
  argTypes: {
    variant: { control: 'select', options: VARIANTS },
    size: { control: 'inline-radio', options: SIZES },
    leading: { control: false },
    trailing: { control: false },
  },
  parameters: {
    docs: {
      description: {
        component:
          'Una sola pieza para toda acción clickeable. Variantes semánticas y tamaños en pasos de 8 px; el radio crece con el tamaño (xs lg · sm xl · md y lg 2xl · xl 3xl). Dentro de una tarjeta, `secondary` sube un paso solo (token `--secondary-on-card`).',
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof Button>;

export const Playground: Story = {};

export const Variantes: Story = {
  render: (args) => (
    <div className="ds-doc-row">
      {VARIANTS.map((v) => <Button key={v} {...args} variant={v}>{v}</Button>)}
    </div>
  ),
};

export const Tamanos: Story = {
  name: 'Tamaños',
  render: (args) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {SIZES.map((s) => (
        <div key={s} className="ds-doc-row">
          <span className="ds-label">{s} · {{ xs: 28, sm: 36, md: 44, lg: 52, xl: 60 }[s]}px</span>
          <Button {...args} size={s} leading={<Icon name="plusCircle" size={18} />}>Nuevo gasto</Button>
          <Button {...args} size={s} variant="secondary">Cancelar</Button>
          <Button {...args} size={s} variant="secondary" iconOnly aria-label="Buscar"><Icon name="search" size={18} /></Button>
        </div>
      ))}
    </div>
  ),
};

export const ConIconos: Story = {
  name: 'Con íconos',
  render: () => (
    <div className="ds-doc-row">
      <Button leading={<Icon name="plus" size={18} />}>Nuevo movimiento</Button>
      <Button variant="secondary" trailing={<kbd>E</kbd>} leading={<Icon name="pencil" size={16} />}>Editar</Button>
      <Button variant="outline" trailing={<Icon name="arrowRight" size={16} />}>Ver todos</Button>
      <Button variant="muted" iconOnly aria-label="Cerrar"><Icon name="close" size={18} stroke={2.4} /></Button>
      <Button variant="primary" iconOnly aria-label="Enviar"><Icon name="arrowUp" size={18} /></Button>
    </div>
  ),
};

export const Estados: Story = {
  render: () => (
    <div className="ds-doc-row">
      <Button>Normal</Button>
      <Button disabled>Deshabilitado</Button>
      <Button loading>Guardando</Button>
      <Button variant="secondary" loading iconOnly aria-label="Actualizando" />
      <Button href="#" variant="outline">Es un link</Button>
    </div>
  ),
};

export const EnTarjeta: Story = {
  name: 'Dentro de una tarjeta',
  render: () => (
    <div className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 }}>
      <span className="type-label-lg">Tarjeta compartida</span>
      <span className="type-body-sm" style={{ color: 'var(--muted-foreground)' }}>secondary sube un paso para no fundirse con la tarjeta.</span>
      <div className="ds-doc-row"><Button variant="secondary">Secondary</Button><Button variant="outline">Outline</Button><Button>Pagar</Button></div>
    </div>
  ),
};

export const Bloque: Story = {
  render: () => (
    <div style={{ maxWidth: 390, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Button block size="xl">Guardar gasto</Button>
      <Button block size="lg" variant="ghost">Ahora no</Button>
    </div>
  ),
};
