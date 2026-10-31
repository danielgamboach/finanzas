import React, { forwardRef } from 'react';
import './AmountInput.css';

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  symbol?: string;
  /** display: top of the movement form ("100.000 CRC", left aligned, the code after). large / small: centered or boxed, with the symbol before. */
  size?: 'display' | 'large' | 'small';
  /** The currency code after the amount (display). With `onUnit` it's a button that switches the currency. */
  unit?: string;
  onUnit?: () => void;
  unitLabel?: string;
  /** Amount in the income color. */
  positive?: boolean;
  wrapClassName?: string;
};

/** The amount being typed. display: the movement form. large: centered. small: secondary amounts (card payment, goal). */
export const AmountInput = forwardRef<HTMLInputElement, Props>(function AmountInput(
  { symbol = '¢', size = 'large', unit, onUnit, unitLabel, positive, wrapClassName, className, ...rest },
  ref,
) {
  if (size === 'display') {
    const shown = String(rest.value ?? '') || String(rest.placeholder ?? '');
    // long amounts step down a size so "1.250.000,50 CRC" still fits a phone
    const fit = shown.length > 15 ? 'xxs' : shown.length > 12 ? 'xs' : shown.length > 9 ? 'sm' : 'md';
    return (
      <div className={['ds-amount', 'ds-amount--display', `ds-amount--fit-${fit}`, positive && 'is-positive', wrapClassName].filter(Boolean).join(' ')}>
        <label className="ds-amount__grow" data-value={shown}>
          <input ref={ref} inputMode="decimal" size={1} className={['ds-amount__field', className].filter(Boolean).join(' ')} {...rest} />
        </label>
        {unit && (onUnit ? (
          // the tap doesn't take the focus, so the keyboard stays up while the currency switches
          <button type="button" className="ds-amount__unit" onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={onUnit} aria-label={unitLabel}>{unit}</button>
        ) : <span className="ds-amount__unit">{unit}</span>)}
      </div>
    );
  }
  return (
    <label className={['ds-amount', `ds-amount--${size}`, positive && 'is-positive', wrapClassName].filter(Boolean).join(' ')}>
      <span className="ds-amount__sym">{symbol}</span>
      <input ref={ref} inputMode="decimal" className={['ds-amount__field', className].filter(Boolean).join(' ')} {...rest} />
    </label>
  );
});
