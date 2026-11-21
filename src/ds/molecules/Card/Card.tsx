import React from 'react';
import { cn } from '../../lib/utils';
import { Slot } from '../../lib/slot';
import './Card.css';

type CardProps = { surface?: 'card' | 'muted'; padding?: 'md' | 'none'; as?: 'div' | 'section' | 'a' | 'button'; asChild?: boolean } & React.HTMLAttributes<HTMLElement> & { href?: string };

/**
 * shadcn Card over our surfaces (radius 3xl). card: on the background. muted: a quieter area inside a sheet.
 * padding none for lists that reach the edge. Compose with CardHeader, CardTitle, CardDescription, CardAction, CardContent and CardFooter.
 */
export function Card({ surface = 'card', padding = 'md', as: Tag = 'div', asChild, className, children, ...rest }: CardProps) {
  const El = (asChild ? Slot : Tag) as React.ElementType;
  return <El data-slot="card" className={cn('ds-card', `ds-card--${surface}`, padding === 'md' && 'ds-card--pad', className)} {...rest}>{children}</El>;
}

const part = (slot: string, cls: string, Tag: keyof React.JSX.IntrinsicElements = 'div') =>
  function CardPart({ className, ...rest }: React.HTMLAttributes<HTMLElement>) {
    const El = Tag as React.ElementType;
    return <El data-slot={slot} className={cn(cls, className)} {...rest} />;
  };

/** Title, description and an optional CardAction on the right. */
export const CardHeader = part('card-header', 'ds-card__header');
export const CardTitle = part('card-title', 'ds-card__title', 'h3');
export const CardDescription = part('card-description', 'ds-card__description', 'p');
/** Top right of the header: a Button xs, a menu. */
export const CardAction = part('card-action', 'ds-card__action');
export const CardContent = part('card-content', 'ds-card__content');
export const CardFooter = part('card-footer', 'ds-card__footer');
