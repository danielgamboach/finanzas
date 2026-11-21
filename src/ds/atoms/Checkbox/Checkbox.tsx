import React from 'react';
import { Icon } from '../Icon/Icon';
import { cn } from '../../lib/utils';
import './Checkbox.css';

/**
 * shadcn Checkbox, round (holding a row in Movimientos starts selecting).
 * Decorative unless onCheckedChange (or the old onChange) is given.
 */
export function Checkbox({ checked, onCheckedChange, onChange, label, id, disabled, className }: { checked: boolean; onCheckedChange?: (v: boolean) => void; onChange?: (v: boolean) => void; label?: string; id?: string; disabled?: boolean; className?: string }) {
  const handler = onCheckedChange ?? onChange;
  const box = <span data-slot="checkbox-indicator" className={checked ? 'ds-check on' : 'ds-check'} aria-hidden="true">{checked && <Icon name="check" size={14} />}</span>;
  if (!handler) return <span data-slot="checkbox" data-state={checked ? 'checked' : 'unchecked'} className={className}>{box}</span>;
  return (
    <label data-slot="checkbox" data-state={checked ? 'checked' : 'unchecked'} className={cn('ds-check-wrap', className)}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} aria-label={label} onChange={(e) => handler(e.target.checked)} />
      {box}
    </label>
  );
}
