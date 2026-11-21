import React from 'react';
import { cn } from '../../lib/utils';
import './Switch.css';

type SwitchProps = {
  checked: boolean;
  /** shadcn name. */
  onCheckedChange?: (v: boolean) => void;
  /** Old name, same thing. */
  onChange?: (v: boolean) => void;
  label?: string; disabled?: boolean; id?: string; name?: string; className?: string;
};

/** shadcn Switch: on/off. Renders a real checkbox with role="switch". */
export function Switch({ checked, onCheckedChange, onChange, label, disabled, id, name, className }: SwitchProps) {
  return (
    <label data-slot="switch" data-state={checked ? 'checked' : 'unchecked'} className={cn('ds-switch', className)}>
      <input id={id} name={name} type="checkbox" role="switch" checked={checked} disabled={disabled} aria-label={label} onChange={(e) => (onCheckedChange ?? onChange)?.(e.target.checked)} />
      <span data-slot="switch-thumb" aria-hidden="true" />
    </label>
  );
}
