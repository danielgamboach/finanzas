import React, { useState } from 'react';
import './Avatar.css';

export type AvatarColor = 'mint' | 'peach' | 'sky' | 'butter' | 'lilac' | 'pink' | 'cyan' | 'gray';
const SIZES = { sm: 32, md: 40, lg: 48 } as const;

export interface AvatarProps {
  /** Emoji shown on the category color when there is no image. */
  emoji?: string;
  /** A logo or photo (merchants). Falls back to the emoji if it fails to load. */
  img?: string | null;
  /** One letter, for people without an emoji. */
  initial?: string;
  /** Category color behind the emoji. */
  color?: AvatarColor | string | null;
  /** sm 32 · md 40 · lg 48, or any number of px (the spend card bubbles). */
  size?: keyof typeof SIZES | number;
  /** Small image at the bottom right (Apple subscriptions carry the Apple logo). */
  badge?: string | null;
  className?: string;
  style?: React.CSSProperties;
}

/** The face of a merchant, category, person or space: a rounded square with an emoji, a logo or an initial. */
export function Avatar({ emoji, img, initial, color, size = 'md', badge, className, style }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  const px = typeof size === 'number' ? size : SIZES[size];
  // radius follows the size: 32 and under xl, bigger 2xl, tiny ones lg
  const r = px <= 24 ? 'lg' : px <= 36 ? 'xl' : '2xl';
  const photo = img && !broken;
  const face = (
    <span
      className={['ds-avatar', `ds-avatar--r-${r}`, photo ? 'ds-avatar--photo' : initial && !emoji ? 'ds-avatar--initial' : '', !badge && className].filter(Boolean).join(' ')}
      style={{ width: px, height: px, fontSize: Math.round(px * 0.46), ...(photo || !color ? null : { background: `var(--category-${color})` }), ...(badge ? null : style) }}
      aria-hidden="true"
    >
      {photo ? <img src={img} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} /> : emoji || initial}
    </span>
  );
  if (!badge) return face;
  const b = Math.max(14, Math.round(px * 0.42));
  return (
    <span className={['ds-avatar-wrap', className].filter(Boolean).join(' ')} style={{ width: px, height: px, ...style }} aria-hidden="true">
      {face}
      <span className="ds-avatar-badge" style={{ width: b, height: b }}><img src={badge} alt="" loading="lazy" decoding="async" /></span>
    </span>
  );
}
