import React from 'react';
import { Icon } from '../../atoms/Icon/Icon';
import './KaiButton.css';

/** Opens Kai. icon: in the Inicio bar (32 px square, magic wand). chip: with a label (AI note). */
export function KaiButton({ type = 'icon', label = 'Preguntale a Kai', onClick, className }: { type?: 'icon' | 'chip'; label?: string; onClick?: () => void; className?: string }) {
  return (
    <button type="button" className={['ds-kai', `ds-kai--${type}`, className].filter(Boolean).join(' ')} onClick={onClick} aria-label={type === 'icon' ? label : undefined}>
      {type === 'icon' ? <Icon name="wand" size={12} stroke={2.4} /> : <Icon name="sparkle" size={18} />}
      {type === 'chip' && <span>{label}</span>}
    </button>
  );
}
