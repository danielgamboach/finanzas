import React from 'react';
import './Segmented.css';

export interface SegmentedOption<T extends string> { value: T; label: React.ReactNode; ariaLabel?: string }

/** Mutually exclusive views. md fills the width (Presupuesto / Tendencias); sm sits inside cards; ghost is text only (ranges under the Inicio chart). */
export function Segmented<T extends string>({ options, value, onChange, size = 'md', label, className }: { options: SegmentedOption<T>[]; value: T; onChange: (v: T) => void; size?: 'md' | 'sm' | 'ghost'; label?: string; className?: string }) {
  return (
    <div className={['ds-seg', `ds-seg--${size}`, className].filter(Boolean).join(' ')} role="tablist" aria-label={label} style={size === 'md' ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} aria-label={o.ariaLabel} className={o.value === value ? 'is-on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
