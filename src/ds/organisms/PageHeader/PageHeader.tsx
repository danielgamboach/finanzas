import React from 'react';
import { Button } from '../../atoms/Button/Button';
import { Icon } from '../../atoms/Icon/Icon';
import './PageHeader.css';

/**
 * Top of every screen (62 px, like Inicio and Cuentas): an optional back button, the title in 3xl and
 * small square actions on the right (Button xs). Sub-screens pass onBack.
 */
export function PageHeader({ title, onBack, backLabel = 'Volver', actions, className }: {
  title: React.ReactNode;
  onBack?: () => void;
  backLabel?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={['ds-page-head', onBack && 'has-back', className].filter(Boolean).join(' ')}>
      {onBack && (
        <Button variant="secondary" size="xs" iconOnly onClick={onBack} aria-label={backLabel} className="ds-page-head__back">
          <Icon name="back" size={12} stroke={2.4} />
        </Button>
      )}
      <h1 className="ds-page-head__title">{title}</h1>
      {actions && <div className="ds-page-head__actions">{actions}</div>}
    </header>
  );
}
