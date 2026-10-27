import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useState } from 'react';
import { FieldGroup, FieldRow } from './FieldRow';
import { Switch } from '../../atoms/Switch/Switch';

const meta: Meta = { title: 'Moléculas/FieldRow' };
export default meta;
export const Grupo: StoryObj = {
  render: () => {
    const [on, setOn] = useState(true);
    return (
      <div style={{ maxWidth: 358 }}>
        <FieldGroup>
          <FieldRow label="Monto">¢12.500</FieldRow>
          <FieldRow label="Categoría"><select defaultValue="s"><option value="s">Supermercado</option><option>Comida</option></select></FieldRow>
          <FieldRow label="Cuenta" onClick={() => {}}>Visa compartida</FieldRow>
          <FieldRow label="Repetir cada mes"><Switch checked={on} onChange={setOn} label="Repetir" /></FieldRow>
        </FieldGroup>
      </div>
    );
  },
};
