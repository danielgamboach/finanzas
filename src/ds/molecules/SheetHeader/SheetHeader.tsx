import React from 'react';
import { Button } from '../../atoms/Button/Button';
import { Icon } from '../../atoms/Icon/Icon';
import { Grabber } from '../../atoms/Utility/Utility';
import { cn } from '../../lib/utils';
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
    <div data-slot="sheet-header" className={['ds-sheet-head', `ds-sheet-head--${layout}`, className].filter(Boolean).join(' ')}>
      {grabber && <Grabber className="ds-sheet-head__grab" />}
      <div className="ds-sheet-head__row">
        <div className="ds-sheet-head__text">{t}{subtitle && <span className="ds-sheet-head__sub">{subtitle}</span>}</div>
        {children}
        {onClose && <Button variant="secondary" size="xs" iconOnly aria-label="Cerrar" onClick={onClose} className="ds-sheet-head__close"><Icon name="close" size={14} stroke={2.4} /></Button>}
      </div>
    </div>
  );
}

/** shadcn SheetTitle / SheetDescription, for sheets that lay out their own header. */
export function SheetTitle({ className, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 data-slot="sheet-title" className={cn('ds-sheet-head__title', className)} {...rest} />;
}
export function SheetDescription({ className, ...rest }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span data-slot="sheet-description" className={cn('ds-sheet-head__sub', className)} {...rest} />;
}
/** Bottom of a sheet. For save buttons use ActionBar. */
export function SheetFooter({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="sheet-footer" className={cn('ds-sheet-foot', className)} {...rest} />;
}
