import React from 'react';
import './Alert.css';

export type AlertTone = 'warning' | 'destructive' | 'success' | 'ai' | 'neutral';

/** A notice inside the page: limits, sync, Kai tips. md has a title; sm is one line. With href it's a link. */
export function Alert({ tone = 'neutral', size = 'md', icon, title, children, href, className }: { tone?: AlertTone; size?: 'md' | 'sm'; icon?: React.ReactNode; title?: React.ReactNode; children?: React.ReactNode; href?: string; className?: string }) {
  const cls = ['ds-alert', `ds-alert--${tone}`, `ds-alert--${size}`, className].filter(Boolean).join(' ');
  const body = (
    <>
      {icon && <span className="ds-alert__icon" aria-hidden="true">{icon}</span>}
      <span className="ds-alert__text">
        {title && size === 'md' && <strong>{title}</strong>}
        {children && <span>{children}</span>}
      </span>
    </>
  );
  return href ? <a className={cls} href={href}>{body}</a> : <div className={cls} role="status">{body}</div>;
}
