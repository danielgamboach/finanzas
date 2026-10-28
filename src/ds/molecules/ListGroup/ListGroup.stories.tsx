import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { ListGroup, ListRow } from './ListGroup';
import { Avatar } from '../../atoms/Avatar/Avatar';
import { Button } from '../../atoms/Button/Button';
import { Progress } from '../../atoms/Progress/Progress';

const meta: Meta = { title: 'Moléculas/ListGroup' };
export default meta;

const crc = (v: string) => <>{v}<span className="amt-unit"> CRC</span></>;

export const Variantes: StoryObj = {
  render: () => (
    <div style={{ maxWidth: 342, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ListGroup title="Pagos pendientes" count={2}>
        <ListRow leading={<Avatar emoji="💡" color="cyan" />} title="Agua AyA" detail={<><span className="ds-pp__when is-overdue">Venció hace 2 días</span> · ≈ 18.400 CRC</>} actions={<Button size="xs">Pagué</Button>} href="#" />
        <ListRow leading={<Avatar emoji="🏠" color="gray" />} title="Alquiler" detail={<><span className="ds-pp__when is-due">Mañana</span> · 350.000 CRC</>} actions={<Button size="xs">Pagué</Button>} href="#" />
      </ListGroup>
      <ListGroup title="Tarjetas de crédito">
        <ListRow leading={<ListRow.Icon name="cards" color="var(--account-yellow)" />} title="Visa compartida" detail={['USD/CRC', 'Crédito', '**7205']} value="¢350.000" chevron href="#" />
        <ListRow leading={<ListRow.Icon name="chartHistogram" color="var(--account-emerald)" />} title="Hapi" detail={['USD', 'Inversión']} value="2.250 USD" valueDetail="+$3,51 (+0,15%)" valueDetailTone="success" chevron href="#" />
      </ListGroup>
      <ListGroup title="Categorías" action={<a href="#">Nueva</a>}>
        <ListRow leading={<Avatar emoji="🛒" color="mint" />} title="Supermercado" detail="119.510 de 250.000 CRC" value="48%" chevron href="#" below={<Progress size="sm" value={0.48} />} />
      </ListGroup>
    </div>
  ),
};
