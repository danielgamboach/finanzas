import React from 'react';
import { Icon } from '../../atoms/Icon/Icon';
import './Delta.css';

/**
 * Change against the previous period. tone says if it's good or bad (spending more is bad even if it goes up);
 * direction only turns the arrow. variant text: no pill, bigger. arrow: small solid arrow and the percentage (under the big number on Inicio).
 */
export function Delta({ value, tone, direction, variant = 'pill', title, className }: { value: React.ReactNode; tone: 'good' | 'bad'; direction?: 'up' | 'down'; variant?: 'pill' | 'text' | 'arrow'; title?: string; className?: string }) {
  return (
    <span className={['ds-delta', `ds-delta--${variant}`, `ds-delta--${tone}`, className].filter(Boolean).join(' ')} title={title}>
      {direction && variant === 'pill' && <Icon name={direction === 'up' ? 'deltaUp' : 'deltaDown'} size={14} />}
      {direction && variant === 'arrow' && <Icon name={direction === 'up' ? 'deltaUp' : 'deltaDown'} size={12} solid />}
      {value}
    </span>
  );
}
