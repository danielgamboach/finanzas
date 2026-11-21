import React, { useId } from 'react';
import { cn } from '../../lib/utils';
import { Label } from '../../atoms/Input/Label';
import './Field.css';

/**
 * Label + control + help or error. Pass the control as children (Input, select…); it gets the id.
 * shadcn parts for custom layouts: FieldSet, FieldLegend, FieldLabel, FieldDescription, FieldError.
 */
export function Field({ label, hint, error, children, className }: { label: React.ReactNode; hint?: React.ReactNode; error?: React.ReactNode; children: React.ReactElement<{ id?: string; invalid?: boolean }>; className?: string }) {
  const id = useId();
  const child = React.isValidElement(children) ? React.cloneElement(children, { id, ...(error ? { invalid: true } : null) }) : children;
  return (
    <div data-slot="field" data-invalid={error ? true : undefined} className={cn('ds-field', className)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {child}
      {error ? <FieldError>{error}</FieldError> : hint ? <FieldDescription>{hint}</FieldDescription> : null}
    </div>
  );
}

export function FieldLabel({ className, ...rest }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <Label data-slot="field-label" className={cn('ds-field__label', className)} {...rest} />;
}
export function FieldDescription({ className, ...rest }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span data-slot="field-description" className={cn('ds-field__hint', className)} {...rest} />;
}
export function FieldError({ className, ...rest }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span data-slot="field-error" role="alert" className={cn('ds-field__hint is-error', className)} {...rest} />;
}
/** A group of fields with a legend (a form section). */
export function FieldSet({ className, ...rest }: React.FieldsetHTMLAttributes<HTMLFieldSetElement>) {
  return <fieldset data-slot="field-set" className={cn('ds-fieldset', className)} {...rest} />;
}
export function FieldLegend({ className, ...rest }: React.HTMLAttributes<HTMLLegendElement>) {
  return <legend data-slot="field-legend" className={cn('ds-fieldset__legend', className)} {...rest} />;
}
