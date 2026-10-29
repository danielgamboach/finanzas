import React from 'react';
import { Icon } from '../../atoms/Icon/Icon';
import { Badge } from '../../atoms/Badge/Badge';
import './SideMenu.css';

/**
 * The app menu on the phone (like Claude's): it sits under the content, which slides to the right to reveal it.
 * Top slot for the main action, the destinations, optional sections (spaces) and a footer (currency, profile).
 * It only draws the menu; the host moves the content and decides when it's open.
 */
export function SideMenu({ top, children, footer, label = 'Menú', className, style, menuRef }: {
  top?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
  menuRef?: React.Ref<HTMLElement>;
}) {
  return (
    <nav ref={menuRef} className={['ds-side-menu', className].filter(Boolean).join(' ')} aria-label={label} style={style}>
      {top && <div className="ds-side-menu__top">{top}</div>}
      <div className="ds-side-menu__body">{children}</div>
      {footer && <div className="ds-side-menu__foot">{footer}</div>}
    </nav>
  );
}

/** A group inside the menu with a quiet title ("Espacios"). */
SideMenu.Section = function SideMenuSection({ title, children }: { title?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="ds-side-menu__section" role="group" aria-label={typeof title === 'string' ? title : undefined}>
      {title && <span className="ds-side-menu__section-title">{title}</span>}
      {children}
    </div>
  );
};

/**
 * One destination: an icon (or an avatar) and a label; `active` marks the current page.
 * `detail` adds a second line, `count` a badge, `trailing` anything at the end (a check, a gear).
 */
export function SideMenuItem({ icon, leading, label, detail, count, trailing, active, href, onClick, ariaLabel }: {
  icon?: string;
  leading?: React.ReactNode;
  label: React.ReactNode;
  detail?: React.ReactNode;
  count?: number;
  trailing?: React.ReactNode;
  active?: boolean;
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  ariaLabel?: string;
}) {
  const inner = (
    <>
      {leading ?? (icon && <span className="ds-side-item__icon" aria-hidden="true"><Icon name={icon} size={18} solid={active} /></span>)}
      <span className="ds-side-item__text">
        <span className="ds-side-item__label">{label}</span>
        {detail && <span className="ds-side-item__detail">{detail}</span>}
      </span>
      {count ? <Badge count={count} /> : null}
      {trailing && <span className="ds-side-item__trail" aria-hidden="true">{trailing}</span>}
    </>
  );
  const cls = ['ds-side-item', active && 'is-active', detail && 'has-detail'].filter(Boolean).join(' ');
  if (href) return <a className={cls} href={href} onClick={onClick} aria-current={active ? 'page' : undefined} aria-label={ariaLabel}>{inner}</a>;
  return <button type="button" className={cls} onClick={onClick} aria-current={active ? 'page' : undefined} aria-label={ariaLabel}>{inner}</button>;
}

/**
 * Opens the menu. A small square (same as the other header buttons) and, on Inicio, the current space next to it.
 * The dot says something in the menu needs attention (payments to confirm).
 */
export function MenuButton({ onClick, title, dot, dotLabel, label = 'Abrir menú', size = 'md' }: {
  onClick: () => void;
  title?: React.ReactNode;
  dot?: boolean;
  dotLabel?: string;
  label?: string;
  /** md 32 px (Inicio's bar), xs 28 px (next to page titles, like the back button) */
  size?: 'md' | 'xs';
}) {
  return (
    <button type="button" className={['ds-menu-btn', `ds-menu-btn--${size}`, title && 'has-title'].filter(Boolean).join(' ')} onClick={onClick} aria-label={title ? undefined : label}>
      <span className="ds-menu-btn__box" aria-hidden="true">
        <Icon name="menu" size={size === 'xs' ? 14 : 16} stroke={2.4} />
        {dot && <Badge dot className="ds-menu-btn__dot" />}
      </span>
      {title && <span className="ds-menu-btn__title"><span className="ds-sr">{label}, </span>{title}</span>}
      {dot && dotLabel && <span className="ds-sr">{dotLabel}</span>}
    </button>
  );
}
