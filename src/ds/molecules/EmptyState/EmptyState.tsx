import React from 'react';
import './EmptyState.css';

/** What shows when a list is empty: what's missing and, if possible, the action that fills it. `icon`: an <Icon size={24} /> (or a category's emoji), shown in a muted tile. */
export function EmptyState({ icon, title, children, action, className }: { icon?: React.ReactNode; title?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={['ds-empty', className].filter(Boolean).join(' ')}>
      {icon && <span className="ds-empty__icon" aria-hidden="true">{icon}</span>}
      {title && <strong className="ds-empty__title">{title}</strong>}
      {children && <span className="ds-empty__body">{children}</span>}
      {action && <span className="ds-empty__action">{action}</span>}
    </div>
  );
}
