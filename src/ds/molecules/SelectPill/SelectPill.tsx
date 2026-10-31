import React from 'react';
import { Icon } from '../../atoms/Icon/Icon';
import './SelectPill.css';

/**
 * A choice inside a sentence ("↗ Gasto ⌄ en Efectivo ⌄", "Categoría 🍟 Restaurantes ⌄"): quiet text with a chevron,
 * over a native select so phones show their own picker and it works with the keyboard.
 * `icon` (a UIcons name) or `emoji` goes before the label; `strong` paints the label in the foreground color.
 */
export function SelectPill({ label, value, onChange, children, icon, emoji, strong, disabled, ariaLabel, className }: {
  label: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  /** The <option>s (and <optgroup>s) of the native select. */
  children: React.ReactNode;
  icon?: string;
  emoji?: string | null;
  strong?: boolean;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <label className={['ds-select-pill', strong && 'is-strong', disabled && 'is-disabled', className].filter(Boolean).join(' ')}>
      {icon && <Icon name={icon} size={12} />}
      {emoji && <span className="ds-select-pill__emoji" aria-hidden="true">{emoji}</span>}
      <span className="ds-select-pill__label" aria-hidden="true">{label}</span>
      <Icon name="chevDown" size={12} stroke={2.4} />
      <select value={value} disabled={disabled} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  );
}
