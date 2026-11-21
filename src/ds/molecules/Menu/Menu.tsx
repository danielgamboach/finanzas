import React from 'react';
import { Icon } from '../../atoms/Icon/Icon';
import { cn } from '../../lib/utils';
import './Menu.css';

/** A floating list of options (switch space, row actions). */
export function Menu({ children, className, label }: { children: React.ReactNode; className?: string; label?: string }) {
  return <div data-slot="dropdown-menu-content" className={['ds-menu', className].filter(Boolean).join(' ')} role="menu" aria-label={label}>{children}</div>;
}

/** One option. selected: the current one (muted background + check). muted: a secondary action. */
export function MenuItem({ icon, children, selected, muted, meta, onClick, className }: { icon?: React.ReactNode; children: React.ReactNode; selected?: boolean; muted?: boolean; meta?: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button type="button" data-slot="dropdown-menu-item" role="menuitemradio" aria-checked={!!selected} className={['ds-menu-item', selected && 'is-selected', muted && 'is-muted', className].filter(Boolean).join(' ')} onClick={onClick}>
      {icon}
      <span className="ds-menu-item__label">{children}{meta && <span className="ds-menu-item__meta">{meta}</span>}</span>
      {selected && <Icon name="check" size={18} />}
    </button>
  );
}

/** A small title above a set of items (shadcn DropdownMenuLabel). */
export function MenuLabel({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="dropdown-menu-label" role="presentation" className={cn('ds-menu-label', className)} {...rest} />;
}
/** A line between sets of items (shadcn DropdownMenuSeparator). */
export function MenuSeparator({ className }: { className?: string }) {
  return <div data-slot="dropdown-menu-separator" role="separator" className={cn('ds-menu-sep', className)} />;
}

/* shadcn names, same components. Opening and positioning stay with the host (sheets, popovers in the app). */
export { Menu as DropdownMenuContent, MenuItem as DropdownMenuItem, MenuLabel as DropdownMenuLabel, MenuSeparator as DropdownMenuSeparator };
