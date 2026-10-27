import React from 'react';
import { Icon } from '../../atoms/Icon/Icon';
import './KaiButton.css';

/** Opens Kai. icon: in the Inicio bar. chip: with a label (AI note). */
export function KaiButton({ type = 'icon', label = 'Preguntale a Kai', onClick, className }: { type?: 'icon' | 'chip'; label?: string; onClick?: () => void; className?: string }) {
  return (
    <button type="button" className={['ds-kai', `ds-kai--${type}`, className].filter(Boolean).join(' ')} onClick={onClick} aria-label={type === 'icon' ? label : undefined}>
      <Icon name="sparkle" size={18} />
      {type === 'chip' && <span>{label}</span>}
    </button>
  );
}
