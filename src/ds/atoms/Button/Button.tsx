import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { Slot } from '../../lib/slot';
import { Icon } from '../Icon/Icon';
import './Button.css';

/**
 * shadcn Button anatomy over the Kai Finance tokens.
 * Variants use shadcn names (default, secondary, outline, ghost, link, destructive) plus ours (muted, destructive-outline).
 * `primary` stays as an alias of `default`. Sizes: xs 28 · sm 36 · md/default 44 · lg 52 · xl 60; `icon`, `icon-xs`… are square.
 */
export const buttonVariants = cva('ds-btn', {
  variants: {
    variant: {
      default: 'ds-btn--primary',
      primary: 'ds-btn--primary',
      secondary: 'ds-btn--secondary',
      muted: 'ds-btn--muted',
      outline: 'ds-btn--outline',
      ghost: 'ds-btn--ghost',
      link: 'ds-btn--link',
      destructive: 'ds-btn--destructive',
      'destructive-outline': 'ds-btn--destructive-outline',
    },
    size: {
      xs: 'ds-btn--xs',
      sm: 'ds-btn--sm',
      md: 'ds-btn--md',
      default: 'ds-btn--md',
      lg: 'ds-btn--lg',
      xl: 'ds-btn--xl',
      icon: 'ds-btn--md ds-btn--icon',
      'icon-xs': 'ds-btn--xs ds-btn--icon',
      'icon-sm': 'ds-btn--sm ds-btn--icon',
      'icon-lg': 'ds-btn--lg ds-btn--icon',
    },
  },
  defaultVariants: { variant: 'default', size: 'md' },
});

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>;

type Common = {
  /** Visual weight. Mirrors the "Variant" property of the Button component in Figma. */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Square button that only holds an icon. Needs an aria-label. Same as size="icon-*". */
  iconOnly?: boolean;
  /** Shows a spinner and blocks clicks while an action runs. */
  loading?: boolean;
  /** Takes the full width of its container. */
  block?: boolean;
  /** shadcn asChild: style the only child (a link, a label) as a button. */
  asChild?: boolean;
  /** Icon (or any node) before the label. */
  leading?: React.ReactNode;
  /** Icon (or any node) after the label, e.g. a keyboard shortcut. */
  trailing?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

export type ButtonProps = Common &
  (
    | ({ href?: undefined } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof Common>)
    | ({ href: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof Common>)
  );

export function Button({ variant = 'default', size = 'md', iconOnly, loading, block, asChild, leading, trailing, children, className, ...rest }: ButtonProps) {
  const square = iconOnly || String(size).startsWith('icon');
  const cls = cn(buttonVariants({ variant, size }), square && 'ds-btn--icon', block && 'ds-btn--block', loading && 'is-loading', className);
  const slotProps = { 'data-slot': 'button', 'data-variant': variant, 'data-size': size } as Record<string, string>;
  if (asChild) return <Slot className={cls} {...slotProps} {...(rest as React.HTMLAttributes<HTMLElement>)}>{children}</Slot>;
  const body = (
    <>
      {loading ? <ButtonSpinner /> : leading}
      {square ? (loading ? null : children) : children && <span className="ds-btn__label">{children}</span>}
      {!square && trailing}
    </>
  );
  if ('href' in rest && rest.href !== undefined) {
    return (
      <a className={cls} aria-busy={loading || undefined} {...slotProps} {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {body}
      </a>
    );
  }
  const { type = 'button', disabled, ...btn } = rest as React.ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...slotProps} {...btn}>
      {body}
    </button>
  );
}

function ButtonSpinner() {
  return (
    <span className="ds-btn__spinner" aria-hidden="true">
      <Icon name="spinner" size={16} />
    </span>
  );
}
