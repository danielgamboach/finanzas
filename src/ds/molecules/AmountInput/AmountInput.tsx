import React, { forwardRef } from 'react';
import './AmountInput.css';

/** The amount being typed. large: top of the expense form. small: secondary amounts (card payment, goal). */
export const AmountInput = forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & { symbol?: string; size?: 'large' | 'small'; wrapClassName?: string }>(
  function AmountInput({ symbol = '¢', size = 'large', wrapClassName, className, ...rest }, ref) {
    return (
      <label className={['ds-amount', `ds-amount--${size}`, wrapClassName].filter(Boolean).join(' ')}>
        <span className="ds-amount__sym">{symbol}</span>
        <input ref={ref} inputMode="decimal" className={['ds-amount__field', className].filter(Boolean).join(' ')} {...rest} />
      </label>
    );
  },
);
