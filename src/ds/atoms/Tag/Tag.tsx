import React from 'react';
import './Tag.css';

export type TagTone = 'neutral' | 'warning' | 'ai' | 'success' | 'destructive';

/** Short status label: "Por revisar", "Varía", "IA". Not clickable (for filters use Chip). */
export function Tag({ tone = 'neutral', size = 'md', children, className, ...rest }: { tone?: TagTone; size?: 'sm' | 'md' | 'lg' } & React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={['ds-tag', `ds-tag--${tone}`, `ds-tag--${size}`, className].filter(Boolean).join(' ')} {...rest}>{children}</span>;
}
