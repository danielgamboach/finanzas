import React from 'react';
import { cn } from '../../lib/utils';
import './Badge.css';

/** A count (pending payments, active filters) or a dot that says "something here needs you". For a text label use StatusBadge (Tag). */
export function Badge({ count, dot, className, ...rest }: { count?: number | string; dot?: boolean } & React.HTMLAttributes<HTMLSpanElement>) {
  if (dot) return <span data-slot="badge-dot" className={cn('ds-badge', 'ds-badge--dot', className)} {...rest} />;
  return <span data-slot="badge-count" className={cn('ds-badge', className)} {...rest}>{count}</span>;
}
