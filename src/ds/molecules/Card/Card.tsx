import React from 'react';
import './Card.css';

/** Base surface (radius 3xl). card: on the background. muted: a quieter area inside a sheet. padding none for lists that reach the edge. */
export function Card({ surface = 'card', padding = 'md', as: Tag = 'div', className, children, ...rest }: { surface?: 'card' | 'muted'; padding?: 'md' | 'none'; as?: 'div' | 'section' | 'a' | 'button' } & React.HTMLAttributes<HTMLElement> & { href?: string }) {
  const El = Tag as React.ElementType;
  return <El className={['ds-card', `ds-card--${surface}`, padding === 'md' && 'ds-card--pad', className].filter(Boolean).join(' ')} {...rest}>{children}</El>;
}
