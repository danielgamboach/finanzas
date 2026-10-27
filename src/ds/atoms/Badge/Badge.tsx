import React from 'react';
import './Badge.css';

/** A count (pending payments, active filters) or a dot that says "something here needs you". */
export function Badge({ count, dot, className, ...rest }: { count?: number | string; dot?: boolean } & React.HTMLAttributes<HTMLSpanElement>) {
  if (dot) return <span className={['ds-badge', 'ds-badge--dot', className].filter(Boolean).join(' ')} {...rest} />;
  return <span className={['ds-badge', className].filter(Boolean).join(' ')} {...rest}>{count}</span>;
}
