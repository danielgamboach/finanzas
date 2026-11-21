import React from 'react';
import { cn } from './utils';

/**
 * Minimal Radix-style Slot, for shadcn's `asChild`: renders its only child and merges props into it
 * (className joined, style merged, handlers chained). Lets a Button or Badge render as a link or any element.
 */
export const Slot = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }>(function Slot({ children, ...props }, ref) {
  if (!React.isValidElement(children)) return null;
  const child = children as React.ReactElement<Record<string, unknown>>;
  const cp = child.props;
  const merged: Record<string, unknown> = { ...props, ...cp };
  for (const k of Object.keys(props)) {
    const a = (props as Record<string, unknown>)[k];
    const b = cp[k];
    if (/^on[A-Z]/.test(k) && typeof a === 'function' && typeof b === 'function') {
      merged[k] = (...args: unknown[]) => { (b as (...x: unknown[]) => void)(...args); (a as (...x: unknown[]) => void)(...args); };
    }
  }
  merged.className = cn(props.className, cp.className as string);
  merged.style = { ...props.style, ...(cp.style as React.CSSProperties) };
  return React.cloneElement(child, { ...merged, ref } as Record<string, unknown>);
});
