import React from 'react';
import './Switch.css';

/** On/off. Renders a real checkbox with role="switch". */
export function Switch({ checked, onChange, label, disabled, className }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean; className?: string }) {
  return (
    <label className={['ds-switch', className].filter(Boolean).join(' ')}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden="true" />
    </label>
  );
}
