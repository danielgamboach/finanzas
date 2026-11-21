import React, { forwardRef } from 'react';
import { Icon } from '../Icon/Icon';
import { cn } from '../../lib/utils';
import './Input.css';

export type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  /** Red border and aria-invalid. The message goes in Field. */
  invalid?: boolean;
  /** Icon name shown before the text. */
  icon?: string;
  /** Anything after the text (a unit, a button). */
  trailing?: React.ReactNode;
  wrapClassName?: string;
};

/** Single-line text field, 52 px. For a labelled field wrap it in Field. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ invalid, icon, trailing, wrapClassName, className, disabled, ...rest }, ref) {
  return (
    <span data-slot="input-group" className={cn('ds-input', invalid && 'is-invalid', disabled && 'is-disabled', wrapClassName)}>
      {icon && <Icon name={icon} size={18} />}
      <input ref={ref} data-slot="input" className={['ds-input__field', className].filter(Boolean).join(' ')} aria-invalid={invalid || undefined} disabled={disabled} {...rest} />
      {trailing}
    </span>
  );
});
