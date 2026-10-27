import React from 'react';
import { Avatar } from '../../atoms/Avatar/Avatar';
import './SpendCard.css';

export interface SpendBubble { key: string; emoji: string; color?: string | null; img?: string | null }

// where each merchant bubble sits in the cluster: left, top, size
const SPOTS: [number, number, number][] = [[0, 34, 44], [47, 4, 32], [51, 48, 28], [88, 32, 29], [15, 0, 22]];

/** Month spending on Inicio with the latest merchants as bubbles (logo or category emoji) and +N. Takes you to Análisis. */
export function SpendCard({ label, value, bubbles = [], onClick, ariaLabel }: { label: React.ReactNode; value: React.ReactNode; bubbles?: SpendBubble[]; onClick?: () => void; ariaLabel?: string }) {
  const shown = bubbles.slice(0, SPOTS.length);
  const more = bubbles.length - shown.length;
  return (
    <div className="ds-spend">
      <button type="button" className="ds-spend__card" onClick={onClick} aria-label={ariaLabel}>
        <span className="ds-spend__label">{label}</span>
        <span className="ds-spend__value">{value}</span>
      </button>
      {shown.length > 0 && (
        <div className="ds-spend__bubbles" aria-hidden="true">
          {shown.map((b, i) => {
            const [left, top, size] = SPOTS[i];
            return <Avatar key={b.key} emoji={b.emoji} img={b.img} color={b.color} size={size} className="ds-spend__bubble" style={{ left, top }} />;
          })}
          {more > 0 && <span className="ds-spend__more">+{more > 99 ? 99 : more}</span>}
        </div>
      )}
    </div>
  );
}
