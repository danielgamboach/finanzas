import React from 'react';
import { Radio } from '../../atoms/Radio/Radio';
import './OptionCard.css';

/**
 * Picking one option with more weight than a radio. option: card with title, description and radio.
 * tile: square with an icon (account type). pill: short option (frequency).
 */
export function OptionCard({ type = 'option', selected, icon, title, description, onClick, className }: { type?: 'option' | 'tile' | 'pill'; selected?: boolean; icon?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button type="button" role="radio" aria-checked={!!selected} className={['ds-opt', `ds-opt--${type}`, selected && 'is-selected', className].filter(Boolean).join(' ')} onClick={onClick}>
      {icon && <span className="ds-opt__icon" aria-hidden="true">{icon}</span>}
      {type === 'option' ? (
        <>
          <span className="ds-opt__text"><span className="ds-opt__title">{title}</span>{description && <span className="ds-opt__desc">{description}</span>}</span>
          <Radio checked={!!selected} />
        </>
      ) : (
        <span className="ds-opt__title">{title}</span>
      )}
    </button>
  );
}
