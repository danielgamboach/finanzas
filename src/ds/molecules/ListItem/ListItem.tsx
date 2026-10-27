import React from 'react';
import { Icon } from '../../atoms/Icon/Icon';
import './ListItem.css';

export interface ListItemProps {
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Usually Money, a Button or a Tag. */
  trailing?: React.ReactNode;
  /** Adds a chevron at the end (the row opens something). */
  chevron?: boolean;
  /** md 64 · sm 56 */
  density?: 'md' | 'sm';
  onClick?: () => void;
  href?: string;
  className?: string;
}

/** Base list row: face, title, subtitle and something on the right. Accounts, recurring payments and settings lists use it. */
export function ListItem({ leading, title, subtitle, trailing, chevron, density = 'md', onClick, href, className }: ListItemProps) {
  const cls = ['ds-li', `ds-li--${density}`, (onClick || href) && 'is-action', className].filter(Boolean).join(' ');
  const body = (
    <>
      {leading}
      <span className="ds-li__text">
        <span className="ds-li__title">{title}</span>
        {subtitle && <span className="ds-li__sub">{subtitle}</span>}
      </span>
      {trailing}
      {chevron && <Icon name="chevRight" size={18} />}
    </>
  );
  if (href) return <a className={cls} href={href}>{body}</a>;
  if (onClick) return <button type="button" className={cls} onClick={onClick}>{body}</button>;
  return <div className={cls}>{body}</div>;
}
