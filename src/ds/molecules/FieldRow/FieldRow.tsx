import React from 'react';
import { Icon } from '../../atoms/Icon/Icon';
import './FieldRow.css';

type Base = { label: React.ReactNode; children?: React.ReactNode; className?: string };

/** A form row inside a FieldGroup: label on the left, value or control on the right. With onClick it becomes a link-like row with a chevron. */
export function FieldRow({ label, children, className, onClick, htmlFor }: Base & { onClick?: () => void; htmlFor?: string }) {
  const cls = ['ds-frow', className].filter(Boolean).join(' ');
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick}>
        <span className="ds-frow__label">{label}</span>
        <span className="ds-frow__value is-link">{children}<Icon name="chevRight" size={18} /></span>
      </button>
    );
  }
  return (
    <div className={cls}>
      {htmlFor ? <label className="ds-frow__label" htmlFor={htmlFor}>{label}</label> : <span className="ds-frow__label">{label}</span>}
      <span className="ds-frow__value">{children}</span>
    </div>
  );
}

/** A card that stacks FieldRows with dividers. */
export function FieldGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={['ds-fgroup', className].filter(Boolean).join(' ')}>{children}</div>;
}
