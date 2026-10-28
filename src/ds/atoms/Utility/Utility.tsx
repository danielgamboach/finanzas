import React from 'react';
import './Utility.css';

/** A keyboard key, for shortcut hints on desktop. */
export const Kbd = ({ children }: { children: React.ReactNode }) => <kbd className="ds-kbd">{children}</kbd>;

/** The handle at the top of a sheet. */
export const Grabber = ({ className, ...rest }: React.HTMLAttributes<HTMLSpanElement>) => <span className={['ds-grabber', className].filter(Boolean).join(' ')} aria-hidden="true" {...rest} />;

/** A 1 px line between groups. */
export const Separator = ({ className }: { className?: string }) => <hr className={['ds-sep', className].filter(Boolean).join(' ')} />;

/** Something is loading. */
export const Spinner = ({ size = 20, label = 'Cargando' }: { size?: number; label?: string }) => (
  <svg className="ds-spinner" width={size} height={size} viewBox="0 0 24 24" fill="none" role="status" aria-label={label}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity=".2" />
    <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

/** Placeholder lines while content loads. */
/** Text lines while something loads (the AI note, a paragraph). */
export const Skeleton = ({ lines = 3 }: { lines?: number }) => (
  <span className="ds-skeleton" aria-hidden="true">{Array.from({ length: lines }, (_, i) => <span key={i} />)}</span>
);

/**
 * One placeholder shape with the same pulse: a line of text, a number, an avatar, a button.
 * width/height in px (or any CSS length); radius follows the token scale.
 */
export const Bone = ({ width = '100%', height = 12, radius = 'full', className, style }: {
  width?: number | string; height?: number | string; radius?: 'md' | 'lg' | 'xl' | '2xl' | 'full'; className?: string; style?: React.CSSProperties;
}) => (
  <span className={['ds-bone', `ds-bone--r-${radius}`, className].filter(Boolean).join(' ')} style={{ width, height, ...style }} aria-hidden="true" />
);
