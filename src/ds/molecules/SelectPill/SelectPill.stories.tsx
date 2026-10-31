import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useState } from 'react';
import { SelectPill } from './SelectPill';

const meta: Meta = { title: 'Moléculas/SelectPill' };
export default meta;

export const EnUnaFrase: StoryObj = {
  name: 'En una frase',
  render: () => {
    const [type, setType] = useState('gasto');
    const [acc, setAcc] = useState('');
    const [cat, setCat] = useState('rest');
    const cats: Record<string, [string, string]> = { rest: ['🍟', 'Restaurantes'], super: ['🛒', 'Súper'] };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <SelectPill icon={type === 'gasto' ? 'arrowUpRight' : 'arrowDownLeft'} label={type === 'gasto' ? 'Gasto' : 'Ingreso'} value={type} onChange={setType} ariaLabel="Tipo">
            <option value="gasto">Gasto</option>
            <option value="ingreso">Ingreso</option>
          </SelectPill>
          <span className="type-caption" style={{ color: 'var(--muted-foreground)' }}>en</span>
          <SelectPill label={acc ? 'Visa ••4417' : 'Efectivo'} value={acc} onChange={setAcc} ariaLabel="Cuenta">
            <option value="">Efectivo o SINPE</option>
            <option value="visa">Visa ••4417</option>
          </SelectPill>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="type-caption" style={{ color: 'var(--muted-foreground)' }}>Categoría</span>
          <SelectPill emoji={cats[cat][0]} label={cats[cat][1]} value={cat} onChange={setCat} ariaLabel="Categoría">
            {Object.entries(cats).map(([k, [e, n]]) => <option key={k} value={k}>{e} {n}</option>)}
          </SelectPill>
        </div>
      </div>
    );
  },
};
