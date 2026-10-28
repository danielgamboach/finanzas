import React from 'react';
import { Icon } from '../../atoms/Icon/Icon';
import './ListGroup.css';

/**
 * A titled group of rows in one rounded list (Cuentas, Recurrentes, Ajustes, the Inicio sheet).
 * The head is small and quiet; a count or a link can sit on its right.
 */
export function ListGroup({ title, count, action, note, children, footer, className }: {
  title?: React.ReactNode;
  /** How many need attention ("2"), shown quietly next to the title. */
  count?: number;
  /** A small link or button on the right of the head ("Nueva", "Ver todo"). */
  action?: React.ReactNode;
  /** One short line under the head that explains the group. */
  note?: React.ReactNode;
  children: React.ReactNode;
  /** A strip at the bottom of the list ("Ver 3 más", "Todos se cobraron"). */
  footer?: React.ReactNode;
  className?: string;
}) {
  const label = typeof title === 'string' ? title : undefined;
  return (
    <section className={['ds-group', className].filter(Boolean).join(' ')} aria-label={label}>
      {(title || action) && (
        <div className="ds-group__head">
          {title && <h2 className="ds-group__title">{title}{count ? <span className="ds-group__count">{count}</span> : null}</h2>}
          {action && <span className="ds-group__action">{action}</span>}
        </div>
      )}
      {note && <p className="ds-group__note">{note}</p>}
      <div className="ds-group__list">
        {children}
        {footer && <div className="ds-group__foot">{footer}</div>}
      </div>
    </section>
  );
}

export type RowTone = 'muted' | 'warning' | 'destructive' | 'success' | 'default';

export interface ListRowProps {
  /** An Avatar (40) or a 16 px icon in its color (wrap it in ListRow.Icon). */
  leading?: React.ReactNode;
  title: React.ReactNode;
  /** Small line under the title. Pass an array to join facts with " · ". */
  detail?: React.ReactNode | string[];
  detailTone?: RowTone;
  /** The figure on the right: an amount, a percentage. */
  value?: React.ReactNode;
  valueTone?: RowTone;
  /** Small line under the value ("Vence mañana", "+$3,51"). */
  valueDetail?: React.ReactNode;
  valueDetailTone?: RowTone;
  /** Buttons after the value (Pagué, No / Sí). They stay clickable over the row's link. */
  actions?: React.ReactNode;
  /** Extra content under the row, aligned with the text (a progress bar, frequency chips). */
  below?: React.ReactNode;
  chevron?: boolean;
  /** Dims the row (paid, paused). */
  quiet?: boolean;
  /** Smaller text for long lists (the Inicio sheet). */
  density?: 'md' | 'sm';
  href?: string;
  onClick?: () => void;
  /** Accessible name of the row's link, when the title alone isn't enough. */
  label?: string;
  className?: string;
}

/**
 * One row of a ListGroup: face or icon, title and a quiet detail, a figure on the right and a chevron
 * when it opens something. The whole row is the link; actions sit above it.
 */
export function ListRow({ leading, title, detail, detailTone = 'muted', value, valueTone = 'default', valueDetail, valueDetailTone = 'muted', actions, below, chevron, quiet, density = 'md', href, onClick, label, className }: ListRowProps) {
  const cls = ['ds-row', `ds-row--${density}`, (href || onClick) && 'is-link', quiet && 'is-quiet', className].filter(Boolean).join(' ');
  const det = Array.isArray(detail) ? detail.filter(Boolean).join(' · ') : detail;
  const name = href ? (
    <a className="ds-row__hit" href={href} aria-label={label}>{title}</a>
  ) : onClick ? (
    <button type="button" className="ds-row__hit" onClick={onClick} aria-label={label}>{title}</button>
  ) : title;
  return (
    <div className={cls}>
      <div className="ds-row__main">
        {leading}
        <span className="ds-row__text">
          <span className="ds-row__title">{name}</span>
          {det ? <span className={`ds-row__detail is-${detailTone}`}>{det}</span> : null}
        </span>
        {(value != null || valueDetail) && (
          <span className="ds-row__fig">
            {value != null && <span className={`ds-row__value is-${valueTone}`}>{value}</span>}
            {valueDetail && <span className={`ds-row__detail is-${valueDetailTone}`}>{valueDetail}</span>}
          </span>
        )}
        {actions && <span className="ds-row__actions">{actions}</span>}
        {chevron && <span className="ds-row__chev" aria-hidden="true"><Icon name="angleRight" size={12} stroke={2.4} /></span>}
      </div>
      {below && <div className="ds-row__below">{below}</div>}
    </div>
  );
}

/** A 16 px filled icon in a color, the leading of account-like rows. */
ListRow.Icon = function RowIcon({ name, color }: { name: string; color?: string }) {
  return <span className="ds-row__icon" style={color ? { color } : undefined} aria-hidden="true"><Icon name={name} size={16} solid /></span>;
};
