import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useState } from 'react';
import { OptionCard } from './OptionCard';

const meta: Meta = { title: 'Moléculas/OptionCard' };
export default meta;
export const Option: StoryObj = {
  render: () => {
    const [v, setV] = useState('dos');
    return (
      <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 358 }}>
        <OptionCard icon="🦥" title="Solo yo" description="Mis gastos, a mi manera." selected={v === 'uno'} onClick={() => setV('uno')} />
        <OptionCard icon="👫" title="Con alguien más" description="Compartimos gastos y cuentas." selected={v === 'dos'} onClick={() => setV('dos')} />
      </div>
    );
  },
};
export const TileYPill: StoryObj = {
  name: 'Tile y pill',
  render: () => {
    const [t, setT] = useState('c');
    const [p, setP] = useState('q');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div role="radiogroup" className="ds-doc-row">{[['c', '💳', 'Crédito'], ['d', '🏦', 'Débito'], ['e', '💵', 'Efectivo']].map(([k, i, l]) => <OptionCard key={k} type="tile" icon={i} title={l} selected={t === k} onClick={() => setT(k)} />)}</div>
        <div role="radiogroup" className="ds-doc-row">{[['s', 'Semanal'], ['q', 'Quincenal'], ['m', 'Mensual']].map(([k, l]) => <OptionCard key={k} type="pill" title={l} selected={p === k} onClick={() => setP(k)} />)}</div>
      </div>
    );
  },
};
