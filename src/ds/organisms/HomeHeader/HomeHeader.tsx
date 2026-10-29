import React from 'react';
import { Icon } from '../../atoms/Icon/Icon';
import './HomeHeader.css';

/** Top bar of Inicio (62 px): the menu button and the logo on the left, an optional centered title, quick actions on the right. */
export function HomeHeader({ children, center, actions }: { children: React.ReactNode; center?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="ds-home-header">
      <div className="ds-home-header__lead">{children}</div>
      {center && <div className="ds-home-header__center">{center}</div>}
      {actions && <div className="ds-home-header__actions">{actions}</div>}
    </header>
  );
}

/** A small square action in the bar (same shape as Kai's): "Agregar gasto". */
export function HomeHeaderButton({ icon, label, onClick, href }: { icon: string; label: string; onClick?: () => void; href?: string }) {
  const inner = <Icon name={icon} size={20} solid />;
  if (href) return <a className="ds-home-header__btn" href={href} aria-label={label} title={label}>{inner}</a>;
  return <button type="button" className="ds-home-header__btn" onClick={onClick} aria-label={label} title={label}>{inner}</button>;
}
