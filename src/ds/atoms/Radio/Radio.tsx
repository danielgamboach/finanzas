import React from 'react';
import './Radio.css';

/** One option among several. Usually drawn inside an OptionCard; decorative there (the card is the control). */
export function Radio({ checked, className }: { checked: boolean; className?: string }) {
  return <span className={['ds-radio', checked && 'on', className].filter(Boolean).join(' ')} aria-hidden="true" />;
}
