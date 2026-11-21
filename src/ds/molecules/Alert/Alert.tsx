import React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import './Alert.css';

export type AlertTone = 'warning' | 'destructive' | 'success' | 'ai' | 'neutral';
export type AlertVariant = 'default' | AlertTone;

export const alertVariants = cva('ds-alert', {
  variants: {
    variant: { default: 'ds-alert--neutral', neutral: 'ds-alert--neutral', warning: 'ds-alert--warning', destructive: 'ds-alert--destructive', success: 'ds-alert--success', ai: 'ds-alert--ai' },
    size: { md: 'ds-alert--md', sm: 'ds-alert--sm' },
  },
  defaultVariants: { variant: 'default', size: 'md' },
});

/**
 * shadcn Alert: a notice inside the page (limits, sync, Kai tips). md has a title; sm is one line. With href it's a link.
 * Two ways to use it: props (`icon`, `title`, children as the description) or shadcn parts:
 * `<Alert variant="warning"><Icon/><AlertTitle/><AlertDescription/></Alert>`. `tone` is the old name of `variant`.
 */
export function Alert({ tone, variant, size = 'md', icon, title, children, href, className }: { tone?: AlertTone; variant?: AlertVariant; size?: 'md' | 'sm'; icon?: React.ReactNode; title?: React.ReactNode; children?: React.ReactNode; href?: string; className?: string }) {
  const v = variant ?? tone ?? 'default';
  const cls = cn(alertVariants({ variant: v, size }), className);
  const composed = React.Children.toArray(children).some((c) => React.isValidElement(c) && (c.type === AlertTitle || c.type === AlertDescription));
  const body = composed ? (
    <>
      {icon && <span className="ds-alert__icon" aria-hidden="true">{icon}</span>}
      <span className="ds-alert__text">{React.Children.map(children, (c) => (React.isValidElement(c) && c.type !== AlertTitle && c.type !== AlertDescription ? null : c))}</span>
      {React.Children.map(children, (c) => (React.isValidElement(c) && c.type !== AlertTitle && c.type !== AlertDescription ? c : null))}
    </>
  ) : (
    <>
      {icon && <span className="ds-alert__icon" aria-hidden="true">{icon}</span>}
      <span className="ds-alert__text">
        {title && size === 'md' && <AlertTitle>{title}</AlertTitle>}
        {children && <AlertDescription>{children}</AlertDescription>}
      </span>
    </>
  );
  return href ? <a data-slot="alert" className={cls} href={href}>{body}</a> : <div data-slot="alert" data-variant={v} className={cls} role="status">{body}</div>;
}

export function AlertTitle({ className, ...rest }: React.HTMLAttributes<HTMLElement>) {
  return <strong data-slot="alert-title" className={cn('ds-alert__title', className)} {...rest} />;
}
export function AlertDescription({ className, ...rest }: React.HTMLAttributes<HTMLElement>) {
  return <span data-slot="alert-description" className={cn('ds-alert__description', className)} {...rest} />;
}
