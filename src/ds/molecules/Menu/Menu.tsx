import React from 'react';
import { Icon } from '../../atoms/Icon/Icon';
import './Menu.css';

/** A floating list of options (switch space, row actions). */
export function Menu({ children, className, label }: { children: React.ReactNode; className?: string; label?: string }) {
  return <div className={['ds-menu', className].filter(Boolean).join(' ')} role="menu" aria-label={label}>{children}</div>;
}

/** One option. selected: the current one (muted background + check). muted: a secondary action. */
export function MenuItem({ icon, children, selected, muted, meta, onClick, className }: { icon?: React.ReactNode; children: React.ReactNode; selected?: boolean; muted?: boolean; meta?: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={!!selected} className={['ds-menu-item', selected && 'is-selected', muted && 'is-muted', className].filter(Boolean).join(' ')} onClick={onClick}>
      {icon}
      <span className="ds-menu-item__label">{children}{meta && <span className="ds-menu-item__meta">{meta}</span>}</span>
      {selected && <Icon name="check" size={18} />}
    </button>
  );
}
