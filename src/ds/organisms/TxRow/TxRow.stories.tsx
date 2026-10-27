import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useState } from 'react';
import { TxRow } from './TxRow';

const meta: Meta = { title: 'Organismos/TxRow' };
export default meta;
const rows = (context: 'sheet' | 'list') => (
  <div style={{ maxWidth: 390 }}>
    <TxRow context={context} face={{ emoji: '🛒', color: 'mint' }} name="Automercado" detail="Hoy · Supermercado" amount="¢23.450" onClick={() => {}} />
    <TxRow context={context} face={{ emoji: '💰', color: 'butter' }} name="Salario" detail="Ayer · Ingreso" amount="+¢850.000" amountTone="positive" onClick={() => {}} />
    <TxRow context={context} face={{ emoji: '❓', color: 'butter' }} name="SINPE 8888-1234" detail="Hoy · Por revisar" detailTone="warning" amount="¢6.000" onClick={() => {}} />
    <TxRow context={context} face={{ emoji: '🚗', color: 'sky' }} name="Uber" detail="Hoy · Por confirmar" detailTone="warning" amount="¢3.120" amountTone="muted" onClick={() => {}} />
    <TxRow context={context} face={{ emoji: '🚗', color: 'sky' }} name="Uber" detail="No se cobró" amount="¢3.120" amountTone="void" onClick={() => {}} />
  </div>
);
export const Hoja: StoryObj = { name: 'sheet (Inicio)', render: () => rows('sheet') };
export const Lista: StoryObj = { name: 'list (Movimientos)', render: () => rows('list') };
export const Seleccion: StoryObj = {
  name: 'Selección',
  render: () => { const [on, setOn] = useState(true); return <div style={{ maxWidth: 390 }}><TxRow selecting selected={on} onClick={() => setOn(!on)} face={{ emoji: '🍔', color: 'peach' }} name="Soda La Esquina" detail="Comida" amount="¢4.800" /></div>; },
};
