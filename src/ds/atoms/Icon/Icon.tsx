import React from 'react';
import { regular, bold, solid, UICON } from './uicons';

/**
 * Íconos de Flaticon UIcons (Rounded), dibujados en una grilla de 24 px.
 * Los nombres son la API pública (Figma: Icon / nombre); `UICON` dice qué ícono de UIcons usa cada uno.
 * `stroke` se mantiene por compatibilidad: 2.4 o más usa el peso Bold, menos usa Regular.
 * `solid` usa Solid Straight (fi-ss) en los que lo tienen (plus, deltaUp, deltaDown); si no, cae al de siempre.
 * Licencia gratis con atribución: el crédito está al pie de Ajustes.
 */
export const paths = regular;

export function Icon({ name, size = 20, stroke = 2, solid: filled }: { name: keyof typeof regular | string; size?: number; stroke?: number; solid?: boolean }) {
  const d = (filled && solid[name]) || (stroke >= 2.4 ? bold : regular)[name] || regular[name] || '';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export { UICON };
export type IconName = keyof typeof regular;
export const ICON_NAMES = Object.keys(regular) as IconName[];
