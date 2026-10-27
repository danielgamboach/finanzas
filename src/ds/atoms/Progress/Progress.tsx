import React from 'react';
import './Progress.css';

export type ProgressTone = 'default' | 'muted' | 'success' | 'warning' | 'destructive';

/** How much of something is used: a budget, a goal, the first steps. value and marker go from 0 to 1. */
export function Progress({ value, tone = 'default', size = 'md', color, marker, label, className }: {
  value: number; tone?: ProgressTone; size?: 'sm' | 'md' | 'lg';
  /** A category color name; overrides the tone (category budgets). */
  color?: string | null;
  /** A line where something should be by now (e.g. how far into the month we are). */
  marker?: number;
  label?: string; className?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <span className={['ds-progress', `ds-progress--${size}`, `ds-progress--${tone}`, className].filter(Boolean).join(' ')} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
      <span className="ds-progress__fill" style={{ width: `${pct}%`, ...(color ? { background: `var(--category-${color})` } : null) }} />
      {marker != null && <span className="ds-progress__marker" style={{ left: `${Math.max(0, Math.min(1, marker)) * 100}%` }} />}
    </span>
  );
}
