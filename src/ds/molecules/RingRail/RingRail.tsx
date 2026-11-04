import React from 'react';
import { ProgressRing } from '../../atoms/ProgressRing/ProgressRing';
import type { ProgressTone } from '../../atoms/Progress/Progress';
import './RingRail.css';

export interface RingRailItem {
  key: string;
  /** Under the ring. */
  name: string;
  /** In the middle of the ring: an emoji or an icon. */
  face: React.ReactNode;
  value: number;
  tone?: ProgressTone;
  href?: string;
  onClick?: () => void;
  /** Accessible name ("Súper: 23.450 de 200.000 CRC"). */
  label?: string;
}

/** A row of progress rings, one after the other, that scrolls sideways (the budget's limits). */
export function RingRail({ items, label, className }: { items: RingRailItem[]; label?: string; className?: string }) {
  return (
    <div className={['ds-ringrail', className].filter(Boolean).join(' ')} role="list" aria-label={label} data-no-swipe>
      {items.map((it) => {
        const inner = (
          <>
            <ProgressRing value={it.value} tone={it.tone}>{it.face}</ProgressRing>
            <span className="ds-ringrail__name">{it.name}</span>
          </>
        );
        return (
          <div key={it.key} role="listitem" className="ds-ringrail__cell">
            {it.href ? <a className="ds-ringrail__item" href={it.href} aria-label={it.label}>{inner}</a>
              : it.onClick ? <button type="button" className="ds-ringrail__item" onClick={it.onClick} aria-label={it.label}>{inner}</button>
                : <span className="ds-ringrail__item" aria-label={it.label}>{inner}</span>}
          </div>
        );
      })}
    </div>
  );
}
