import React from 'react';
import { Button } from '../../atoms/Button/Button';
import { Icon } from '../../atoms/Icon/Icon';
import { MenuButton } from '../SideMenu/SideMenu';
import './PageHeader.css';

/**
 * Top of every screen (62 px, like Inicio and Cuentas): an optional back button, the title in 3xl and
 * small square actions on the right (Button xs). Sub-screens pass onBack; menu destinations pass onMenu.
 */
export function PageHeader({ title, onBack, onMenu, menuDot, backLabel = 'Volver', actions, className }: {
  title: React.ReactNode;
  onBack?: () => void;
  /** Top-level pages on the phone open the side menu from here (instead of a back arrow). */
  onMenu?: () => void;
  menuDot?: boolean;
  backLabel?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={['ds-page-head', (onBack || onMenu) && 'has-back', className].filter(Boolean).join(' ')}>
      {onBack && (
        <Button variant="secondary" size="xs" iconOnly onClick={onBack} aria-label={backLabel} className="ds-page-head__back">
          <Icon name="back" size={12} stroke={2.4} />
        </Button>
      )}
      {!onBack && onMenu && <MenuButton size="xs" onClick={onMenu} dot={menuDot} />}
      <h1 className="ds-page-head__title">{title}</h1>
      {actions && <div className="ds-page-head__actions">{actions}</div>}
    </header>
  );
}
