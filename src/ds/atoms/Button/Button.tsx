import React from 'react';
import { Icon } from '../Icon/Icon';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'muted' | 'outline' | 'ghost' | 'link' | 'destructive' | 'destructive-outline';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

type Common = {
  /** Visual weight. Mirrors the "Variant" property of the Button component in Figma. */
  variant?: ButtonVariant;
  /** Height: xs 28 · sm 36 · md 44 · lg 52 · xl 60. */
  size?: ButtonSize;
  /** Square button that only holds an icon. Needs an aria-label. */
  iconOnly?: boolean;
  /** Shows a spinner and blocks clicks while an action runs. */
  loading?: boolean;
  /** Takes the full width of its container. */
  block?: boolean;
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

export function Button({ variant = 'primary', size = 'md', iconOnly, loading, block, leading, trailing, children, className, ...rest }: ButtonProps) {
  const cls = ['ds-btn', `ds-btn--${variant}`, `ds-btn--${size}`, iconOnly && 'ds-btn--icon', block && 'ds-btn--block', loading && 'is-loading', className]
    .filter(Boolean)
    .join(' ');
  const body = (
    <>
      {loading ? <Spinner /> : leading}
      {iconOnly ? (loading ? null : children) : children && <span className="ds-btn__label">{children}</span>}
      {!iconOnly && trailing}
    </>
  );
  if ('href' in rest && rest.href !== undefined) {
    return (
      <a className={cls} aria-busy={loading || undefined} {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {body}
      </a>
    );
  }
  const { type = 'button', disabled, ...btn } = rest as React.ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...btn}>
      {body}
    </button>
  );
}

function Spinner() {
  return (
    <span className="ds-btn__spinner" aria-hidden="true">
      <Icon name="spinner" size={16} />
    </span>
  );
}
