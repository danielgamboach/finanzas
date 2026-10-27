import React from 'react';
import { Icon } from '../Icon/Icon';
import './Checkbox.css';

/** Round check for picking several things ("Seleccionar" in Movimientos). Decorative unless onChange is given. */
export function Checkbox({ checked, onChange, label, className }: { checked: boolean; onChange?: (v: boolean) => void; label?: string; className?: string }) {
  const box = <span className={checked ? 'ds-check on' : 'ds-check'} aria-hidden="true">{checked && <Icon name="check" size={14} />}</span>;
  if (!onChange) return <span className={className}>{box}</span>;
  return (
    <label className={['ds-check-wrap', className].filter(Boolean).join(' ')}>
      <input type="checkbox" checked={checked} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      {box}
    </label>
  );
}
