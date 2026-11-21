import React, { createContext, useContext, useId, useState } from 'react';
import { cn } from '../../lib/utils';
import './Segmented.css';

export interface SegmentedOption<T extends string> { value: T; label: React.ReactNode; ariaLabel?: string }

/** Mutually exclusive views. md fills the width (Presupuesto / Tendencias); sm sits inside cards; ghost is text only (ranges under the Inicio chart). */
export function Segmented<T extends string>({ options, value, onChange, size = 'md', label, className }: { options: SegmentedOption<T>[]; value: T; onChange: (v: T) => void; size?: 'md' | 'sm' | 'ghost'; label?: string; className?: string }) {
  return (
    <div data-slot="tabs-list" className={['ds-seg', `ds-seg--${size}`, className].filter(Boolean).join(' ')} role="tablist" aria-label={label} style={size === 'md' ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}>
      {options.map((o) => (
        <button key={o.value} data-slot="tabs-trigger" data-state={o.value === value ? 'active' : 'inactive'} type="button" role="tab" aria-selected={o.value === value} aria-label={o.ariaLabel} className={o.value === value ? 'is-on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/*
 * shadcn Tabs over the same look: <Tabs value onValueChange><TabsList><TabsTrigger value/>…</TabsList><TabsContent value/></Tabs>.
 * Segmented stays as the short form when there is no panel to show.
 */
const TabsCtx = createContext<{ value?: string; set: (v: string) => void; id: string } | null>(null);

export function Tabs({ value, defaultValue, onValueChange, className, children }: { value?: string; defaultValue?: string; onValueChange?: (v: string) => void; className?: string; children: React.ReactNode }) {
  const [inner, setInner] = useState(defaultValue);
  const id = useId();
  return (
    <TabsCtx.Provider value={{ value: value ?? inner, id, set: (v) => { setInner(v); onValueChange?.(v); } }}>
      <div data-slot="tabs" className={cn('ds-tabs', className)}>{children}</div>
    </TabsCtx.Provider>
  );
}

export function TabsList({ size = 'md', label, className, children }: { size?: 'md' | 'sm' | 'ghost'; label?: string; className?: string; children: React.ReactNode }) {
  const n = React.Children.count(children);
  return (
    <div data-slot="tabs-list" role="tablist" aria-label={label} className={cn('ds-seg', `ds-seg--${size}`, className)} style={size === 'md' ? { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` } : undefined}>
      {children}
    </div>
  );
}

export function TabsTrigger({ value, className, children, ...rest }: { value: string } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'value'>) {
  const t = useContext(TabsCtx);
  const on = t?.value === value;
  return (
    <button type="button" role="tab" id={`${t?.id}-t-${value}`} aria-controls={`${t?.id}-p-${value}`} aria-selected={on} data-slot="tabs-trigger" data-state={on ? 'active' : 'inactive'} className={cn(on && 'is-on', className)} onClick={() => t?.set(value)} {...rest}>
      {children}
    </button>
  );
}

export function TabsContent({ value, className, children }: { value: string; className?: string; children: React.ReactNode }) {
  const t = useContext(TabsCtx);
  if (t?.value !== value) return null;
  return <div role="tabpanel" id={`${t?.id}-p-${value}`} aria-labelledby={`${t?.id}-t-${value}`} data-slot="tabs-content" className={className}>{children}</div>;
}
