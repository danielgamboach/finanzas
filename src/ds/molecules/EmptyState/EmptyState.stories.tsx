import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { EmptyState } from './EmptyState';
import { Button } from '../../atoms/Button/Button';
import { Icon } from '../../atoms/Icon/Icon';

const meta: Meta = { title: 'Moléculas/EmptyState' };
export default meta;
export const Variantes: StoryObj = { render: () => <div style={{ maxWidth: 358 }}><EmptyState icon={<Icon name="receipt" size={24} />} title="Todavía no hay movimientos">Cuando registrés un gasto, aparece aquí.</EmptyState><EmptyState icon={<Icon name="search" size={24} />} title="Nada con ese nombre" action={<Button variant="secondary" size="sm">Quitar filtros</Button>}>Probá con otra palabra.</EmptyState></div> };
