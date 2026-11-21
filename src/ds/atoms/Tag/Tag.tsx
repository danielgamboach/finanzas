import React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { Slot } from '../../lib/slot';
import './Tag.css';

export type TagTone = 'neutral' | 'warning' | 'ai' | 'success' | 'destructive';
/** shadcn Badge variant names, mapped to our tones. */
export type BadgeVariant = 'default' | 'secondary' | 'outline' | TagTone;

export const badgeVariants = cva('ds-tag', {
  variants: {
    variant: {
      default: 'ds-tag--default',
      secondary: 'ds-tag--neutral',
      neutral: 'ds-tag--neutral',
      outline: 'ds-tag--outline',
      warning: 'ds-tag--warning',
      ai: 'ds-tag--ai',
      success: 'ds-tag--success',
      destructive: 'ds-tag--destructive',
    },
    size: { sm: 'ds-tag--sm', md: 'ds-tag--md', lg: 'ds-tag--lg' },
  },
  defaultVariants: { variant: 'neutral', size: 'md' },
});

type TagProps = { tone?: TagTone; variant?: BadgeVariant; size?: 'sm' | 'md' | 'lg'; asChild?: boolean } & React.HTMLAttributes<HTMLSpanElement>;

/**
 * Short status label: "Por revisar", "Varía", "IA". This is shadcn's Badge (exported as StatusBadge too).
 * Not clickable (for filters use Chip). `tone` is the old name of `variant`.
 */
export function Tag({ tone, variant, size = 'md', asChild, children, className, ...rest }: TagProps) {
  const Comp = asChild ? Slot : 'span';
  const v = variant ?? tone ?? 'neutral';
  return <Comp data-slot="badge" data-variant={v} className={cn(badgeVariants({ variant: v, size }), className)} {...rest}>{children}</Comp>;
}
