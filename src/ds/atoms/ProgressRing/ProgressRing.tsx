import React from 'react';
import type { ProgressTone } from '../Progress/Progress';
import './ProgressRing.css';

/**
 * Circular progress: a ring that fills clockwise from the top, with something in the middle (an emoji, an icon).
 * value goes from 0 to 1; above 1 the ring stays full (the tone says it went over).
 */
export function ProgressRing({ value, tone = 'default', size = 64, thickness = 5, label, children, className }: {
  value: number; tone?: ProgressTone; size?: number; thickness?: number; label?: string; children?: React.ReactNode; className?: string;
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <span className={['ds-ring', `ds-ring--${tone}`, className].filter(Boolean).join(' ')} style={{ width: size, height: size }}
      role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)} aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ds-ring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={thickness} fill="none" />
        <circle className="ds-ring__fill" cx={size / 2} cy={size / 2} r={r} strokeWidth={thickness} fill="none"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      {children != null && <span className="ds-ring__center">{children}</span>}
    </span>
  );
}
