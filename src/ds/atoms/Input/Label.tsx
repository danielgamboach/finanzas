import React from 'react';
import { cn } from '../../lib/utils';
import './Label.css';

/** shadcn Label: the text tied to a control. Field uses it; use it alone next to a Switch or Checkbox. */
export function Label({ className, ...rest }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label data-slot="label" className={cn('ds-label', className)} {...rest} />;
}
