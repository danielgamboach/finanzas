import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import { EmptyState } from './EmptyState';
import { Button } from '../../atoms/Button/Button';

const meta: Meta = { title: 'Moléculas/EmptyState' };
export default meta;
export const Variantes: StoryObj = { render: () => <div style={{ maxWidth: 358 }}><EmptyState icon="🧾" title="Todavía no hay movimientos">Cuando registrés un gasto, aparece aquí.</EmptyState><EmptyState icon="🔍" title="Nada con ese nombre" action={<Button variant="secondary" size="sm">Quitar filtros</Button>}>Probá con otra palabra.</EmptyState></div> };
