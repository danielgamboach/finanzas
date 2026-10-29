import React from 'react';
import { Icon } from '../../atoms/Icon/Icon';
import './KaiButton.css';

/** Opens Kai. icon: 32 px square (magic wand). chip: with a label (AI note). fab: the round floating button on Inicio. */
export function KaiButton({ type = 'icon', label = 'Preguntale a Kai', onClick, className }: { type?: 'icon' | 'chip' | 'fab'; label?: string; onClick?: () => void; className?: string }) {
  return (
    <button type="button" className={['ds-kai', `ds-kai--${type}`, className].filter(Boolean).join(' ')} onClick={onClick} aria-label={type !== 'chip' ? label : undefined}>
      {type === 'icon' ? <Icon name="wand" size={12} stroke={2.4} /> : type === 'fab' ? <Icon name="wand" size={20} stroke={2.4} /> : <Icon name="sparkle" size={18} />}
      {type === 'chip' && <span>{label}</span>}
    </button>
  );
}
