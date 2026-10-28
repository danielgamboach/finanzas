import React from 'react';
import { Button } from '../../atoms/Button/Button';
import { Icon } from '../../atoms/Icon/Icon';
import { Grabber } from '../../atoms/Utility/Utility';
import './SheetHeader.css';

/** Top of a sheet: grabber, title and close. center: title centered without close (the Inicio sheet, collapsed). */
export function SheetHeader({ title, subtitle, onClose, layout = 'start', grabber = true, onTitleClick, children, className }: {
  title: React.ReactNode; subtitle?: React.ReactNode; onClose?: () => void; layout?: 'start' | 'center'; grabber?: boolean;
  onTitleClick?: () => void;
  /** Extra controls next to the close button. */
  children?: React.ReactNode; className?: string;
}) {
  const t = onTitleClick ? <button type="button" className="ds-sheet-head__title" onClick={onTitleClick}>{title}</button> : <h2 className="ds-sheet-head__title">{title}</h2>;
  return (
    <div className={['ds-sheet-head', `ds-sheet-head--${layout}`, className].filter(Boolean).join(' ')}>
      {grabber && <Grabber className="ds-sheet-head__grab" />}
      <div className="ds-sheet-head__row">
        <div className="ds-sheet-head__text">{t}{subtitle && <span className="ds-sheet-head__sub">{subtitle}</span>}</div>
        {children}
        {onClose && <Button variant="secondary" size="xs" iconOnly aria-label="Cerrar" onClick={onClose} className="ds-sheet-head__close"><Icon name="close" size={14} stroke={2.4} /></Button>}
      </div>
    </div>
  );
}
