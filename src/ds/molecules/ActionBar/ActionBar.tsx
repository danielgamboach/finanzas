import React from 'react';
import './ActionBar.css';

/**
 * The save button's home: it sticks to the bottom of whatever scrolls (page, form, sheet) so saving is always one
 * tap away, over a short fade of the background. Put it last in the screen; secondary actions (archive, delete)
 * stay in the content above it. With the on-screen keyboard open it sits right above it (the app sets --kb).
 */
export function ActionBar({ children, className, label = 'Acciones' }: { children: React.ReactNode; className?: string; label?: string }) {
  return <div className={['ds-action-bar', className].filter(Boolean).join(' ')} role="group" aria-label={label}>{children}</div>;
}
