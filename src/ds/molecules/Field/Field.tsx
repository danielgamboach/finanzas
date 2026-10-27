import React, { useId } from 'react';
import './Field.css';

/** Label + control + help or error. Pass the control as children (Input, select…); it gets the id. */
export function Field({ label, hint, error, children, className }: { label: React.ReactNode; hint?: React.ReactNode; error?: React.ReactNode; children: React.ReactElement<{ id?: string; invalid?: boolean }>; className?: string }) {
  const id = useId();
  const child = React.isValidElement(children) ? React.cloneElement(children, { id, ...(error ? { invalid: true } : null) }) : children;
  return (
    <div className={['ds-field', className].filter(Boolean).join(' ')}>
      <label className="ds-field__label" htmlFor={id}>{label}</label>
      {child}
      {error ? <span className="ds-field__hint is-error" role="alert">{error}</span> : hint ? <span className="ds-field__hint">{hint}</span> : null}
    </div>
  );
}
