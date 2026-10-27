import React from 'react';
import { Icon } from '../../atoms/Icon/Icon';
import './Chip.css';

export type ChipProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  selected?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** remove: active filter with an ✕ (calls onRemove); chevron: opens a picker. */
  trailing?: 'none' | 'remove' | 'chevron';
  onRemove?: () => void;
  /** Emoji or icon before the label. */
  leading?: React.ReactNode;
  /** Extra number after the label, e.g. how many there are. */
  count?: number;
  children: React.ReactNode;
};

/** Short choice or active filter. Always a pill. */
export function Chip({ selected, size = 'md', trailing = 'none', onRemove, leading, count, children, className, onClick, ...rest }: ChipProps) {
  const cls = ['ds-chip', `ds-chip--${size}`, selected && 'is-selected', trailing !== 'none' && 'has-trailing', className].filter(Boolean).join(' ');
  const iconSize = size === 'sm' ? 14 : 16;
  return (
    <button type="button" className={cls} aria-pressed={trailing === 'none' ? !!selected : undefined} onClick={trailing === 'remove' && !onClick ? onRemove : onClick} {...rest}>
      {leading}
      <span className="ds-chip__label">{children}</span>
      {count != null && <span className="ds-chip__count">{count}</span>}
      {trailing === 'remove' && <Icon name="close" size={iconSize + 2} />}
      {trailing === 'chevron' && <Icon name="chevDown" size={iconSize} />}
    </button>
  );
}
