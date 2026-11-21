import React, { createContext, useContext, useId } from 'react';
import { cn } from '../../lib/utils';
import './Radio.css';

/** The circle alone. Usually drawn inside an OptionCard; decorative there (the card is the control). */
export function Radio({ checked, className }: { checked: boolean; className?: string }) {
  return <span data-slot="radio-indicator" className={cn('ds-radio', checked && 'on', className)} aria-hidden="true" />;
}

const Ctx = createContext<{ value?: string; name: string; set: (v: string) => void; disabled?: boolean } | null>(null);

/** shadcn RadioGroup: one option among several, with real radio inputs. */
export function RadioGroup({ value, defaultValue, onValueChange, name, disabled, className, children, ...rest }: {
  value?: string; defaultValue?: string; onValueChange?: (v: string) => void; name?: string; disabled?: boolean; className?: string; children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'>) {
  const auto = useId();
  const [inner, setInner] = React.useState(defaultValue);
  const v = value ?? inner;
  return (
    <Ctx.Provider value={{ value: v, name: name ?? auto, disabled, set: (x) => { setInner(x); onValueChange?.(x); } }}>
      <div role="radiogroup" data-slot="radio-group" className={cn('ds-radio-group', className)} {...rest}>{children}</div>
    </Ctx.Provider>
  );
}

/** One option. Put the text next to it in a Label (htmlFor = id). */
export function RadioGroupItem({ value, id, disabled, className, 'aria-label': ariaLabel }: { value: string; id?: string; disabled?: boolean; className?: string; 'aria-label'?: string }) {
  const g = useContext(Ctx);
  const on = g?.value === value;
  return (
    <span data-slot="radio-group-item" data-state={on ? 'checked' : 'unchecked'} className={cn('ds-radio-item', className)}>
      <input type="radio" id={id} name={g?.name} value={value} checked={on} disabled={disabled || g?.disabled} aria-label={ariaLabel} onChange={() => g?.set(value)} />
      <Radio checked={on} />
    </span>
  );
}
