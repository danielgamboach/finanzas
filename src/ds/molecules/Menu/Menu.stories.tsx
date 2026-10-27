import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useState } from 'react';
import { Menu, MenuItem } from './Menu';
import { Icon } from '../../atoms/Icon/Icon';

const meta: Meta = { title: 'Moléculas/Menu' };
export default meta;
export const Espacios: StoryObj = {
  render: () => {
    const [v, setV] = useState('p');
    return (
      <Menu label="Espacio">
        <MenuItem icon={<Icon name="user" size={18} />} selected={v === 'p'} onClick={() => setV('p')}>Personal de Dani</MenuItem>
        <MenuItem icon={<Icon name="user" size={18} />} selected={v === 's'} meta="Compartido" onClick={() => setV('s')}>Simbiosis</MenuItem>
        <MenuItem icon={<Icon name="plus" size={18} />} muted>Nuevo espacio</MenuItem>
      </Menu>
    );
  },
};
