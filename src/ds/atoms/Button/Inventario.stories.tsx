import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { Button, type ButtonProps } from './Button';
import { Icon } from '../Icon/Icon';

/**
 * Every button style that exists in the app today (rendered with its real CSS class),
 * next to the Button that would replace it. Rows with a flag change how it looks.
 */
type Row = {
  cls: string; uses: number; where: 'app' | 'hoja'; label?: string; icon?: string;
  proposal: Omit<ButtonProps, 'children'> & { children?: React.ReactNode }; change?: string;
};

const ROWS: Row[] = [
  { cls: 'btn-dark big', uses: 18, where: 'hoja', label: 'Guardar gasto', proposal: { variant: 'primary', size: 'xl' } },
  { cls: 'btn-dark', uses: 2, where: 'app', label: 'Continuar', proposal: { variant: 'primary', size: 'lg' } },
  { cls: 'btn-dark sm', uses: 8, where: 'hoja', label: 'Pagar', proposal: { variant: 'primary', size: 'md' } },
  { cls: 'btn-light', uses: 12, where: 'hoja', label: 'Cancelar', proposal: { variant: 'outline', size: 'lg' }, change: 'En hojas se ve igual. En oscuro pierde el relleno (queda solo borde).' },
  { cls: 'btn-light sm', uses: 4, where: 'hoja', label: 'Cambiar', proposal: { variant: 'outline', size: 'md' }, change: 'Igual que la fila anterior.' },
  { cls: 'btn-danger', uses: 6, where: 'hoja', label: 'Borrar', proposal: { variant: 'destructive-outline', size: 'lg' } },
  { cls: 'btn-danger solid', uses: 1, where: 'hoja', label: 'Sí, borrar', proposal: { variant: 'destructive', size: 'lg' } },
  { cls: 'round', uses: 13, where: 'app', icon: 'back', proposal: { variant: 'secondary', size: 'md', iconOnly: true }, change: '48 px → 44 px.' },
  { cls: 'round light', uses: 3, where: 'hoja', icon: 'close', proposal: { variant: 'muted', size: 'md', iconOnly: true } },
  { cls: 'icon-btn', uses: 5, where: 'app', icon: 'chevLeft', proposal: { variant: 'ghost', size: 'md', iconOnly: true } },
  { cls: 'kai-send', uses: 1, where: 'hoja', icon: 'arrowUp', proposal: { variant: 'primary', size: 'md', iconOnly: true } },
  { cls: 'pill-btn', uses: 3, where: 'app', label: 'Análisis', proposal: { variant: 'secondary', size: 'sm' }, change: '32 px → 36 px y peso 500 → 600.' },
  { cls: 'pill-btn light', uses: 3, where: 'app', label: 'Nuevo gasto', proposal: { variant: 'primary', size: 'sm' }, change: '32 px → 36 px y peso 500 → 600.' },
  { cls: 'txd-edit', uses: 1, where: 'hoja', label: 'Editar', proposal: { variant: 'primary', size: 'sm' }, change: '40 px → 36 px.' },
  { cls: 'hold-all', uses: 1, where: 'hoja', label: 'Confirmar todos', proposal: { variant: 'primary', size: 'sm' } },
  { cls: 'hold-btn', uses: 1, where: 'hoja', label: 'No se cobró', proposal: { variant: 'outline', size: 'md' }, change: '42 px → 44 px.' },
  { cls: 'hold-btn dark', uses: 1, where: 'hoja', label: 'Sí, se cobró', proposal: { variant: 'primary', size: 'md' }, change: '42 px → 44 px.' },
  { cls: 'pp-pay', uses: 2, where: 'hoja', icon: 'check', proposal: { variant: 'outline', size: 'sm', iconOnly: true }, change: '40 px → 36 px.' },
  { cls: 'action dark', uses: 1, where: 'app', label: 'Actualizar saldos', proposal: { variant: 'primary', size: 'md' } },
  { cls: 'dnew', uses: 1, where: 'app', label: 'Nuevo movimiento', proposal: { variant: 'primary', size: 'sm' }, change: 'Escritorio: 40 px con radio 12 → 36 px en píldora.' },
  { cls: 'tt-more', uses: 2, where: 'app', label: 'Ver más', proposal: { variant: 'secondary', size: 'sm' } },
  { cls: 'txd-mini', uses: 3, where: 'hoja', label: 'Unir con otro comercio', proposal: { variant: 'muted', size: 'xs' } },
  { cls: 'txd-mini dark', uses: 1, where: 'hoja', label: 'Sí', proposal: { variant: 'primary', size: 'xs' } },
  { cls: 'ai-card-refresh', uses: 1, where: 'app', icon: 'refresh', proposal: { variant: 'secondary', size: 'xs', iconOnly: true }, change: '32 px → 28 px.' },
  { cls: 'link-btn', uses: 6, where: 'hoja', label: 'Olvidé mi contraseña', proposal: { variant: 'link' } },
  { cls: 'ob-later', uses: 5, where: 'app', label: 'Ahora no', proposal: { variant: 'ghost', size: 'lg' }, change: 'Texto gris claro → foreground.' },
  { cls: 'pp-undo', uses: 2, where: 'hoja', label: 'Deshacer', proposal: { variant: 'ghost', size: 'xs' }, change: 'Texto gris → foreground.' },
];

function Today({ row }: { row: Row }) {
  return (
    <button className={row.cls} type="button" style={{ pointerEvents: 'none' }}>
      {row.icon ? <Icon name={row.icon} size={18} /> : row.label}
    </button>
  );
}

function Proposal({ row }: { row: Row }) {
  const { children, ...p } = row.proposal;
  return (
    <Button {...p} aria-label={row.icon ? row.icon : undefined}>
      {row.icon ? <Icon name={row.icon} size={18} /> : children ?? row.label}
    </Button>
  );
}

function Cell({ where, children }: { where: Row['where']; children: React.ReactNode }) {
  // sheet rows are shown on a light surface, like in the app
  return where === 'hoja'
    ? <div className="light" style={{ background: 'var(--background)', padding: 12, borderRadius: 'var(--radius-2xl)', display: 'inline-flex' }}>{children}</div>
    : <div className="theme-dark" style={{ background: 'var(--background)', padding: 12, borderRadius: 'var(--radius-2xl)', display: 'inline-flex' }}>{children}</div>;
}

const meta: Meta = { title: 'Átomos/Button/Inventario de hoy' };
export default meta;

export const Inventario: StoryObj = {
  render: () => {
    const total = ROWS.reduce((n, r) => n + r.uses, 0);
    const changes = ROWS.filter((r) => r.change);
    return (
      <div className="ds-doc">
        <h1>Botones del app hoy → Button</h1>
        <p>{ROWS.length} estilos distintos y {total} usos se vuelven un solo componente. A la izquierda cada clase tal como está en producción; a la derecha el Button que la reemplaza. Las filas marcadas cambian algo visible: {changes.length} decisiones para revisar antes de migrar.</p>
        <table className="ds-table">
          <thead><tr><th>Clase de hoy</th><th>Usos</th><th>Hoy</th><th>Propuesta</th><th>Qué cambia</th></tr></thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.cls}>
                <td><div className="ds-name">.{r.cls.replace(/ /g, '.')}</div><div className="ds-meta">{r.where === 'hoja' ? 'en hojas (claro)' : 'en el app (oscuro)'}</div></td>
                <td className="ds-meta">{r.uses}</td>
                <td><Cell where={r.where}><Today row={r} /></Cell></td>
                <td><Cell where={r.where}><Proposal row={r} /></Cell><div className="ds-meta" style={{ marginTop: 6 }}>variant="{r.proposal.variant}"{r.proposal.size ? ` size="${r.proposal.size}"` : ''}{r.proposal.iconOnly ? ' iconOnly' : ''}</div></td>
                <td>{r.change ? <span className="ds-flag">{r.change}</span> : <span className="ds-note">Igual</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  },
};
