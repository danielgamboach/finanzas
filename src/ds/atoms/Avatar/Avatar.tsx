import React, { createContext, useContext, useState } from 'react';
import { cn } from '../../lib/utils';
import { Icon } from '../Icon/Icon';
import './Avatar.css';

export type AvatarColor = 'mint' | 'peach' | 'sky' | 'butter' | 'lilac' | 'pink' | 'cyan' | 'gray';
const SIZES = { sm: 32, md: 40, lg: 48 } as const;

export interface AvatarProps {
  /** Emoji shown on the category color when there is no image. */
  emoji?: string;
  /** A logo or photo (merchants). Falls back to the emoji if it fails to load. */
  img?: string | null;
  /** An icon name, for faces that aren't a category, a merchant or a person (goals, steps, a card payment). */
  icon?: string;
  /** One letter, for people without an emoji. */
  initial?: string;
  /** Category color behind the emoji. */
  color?: AvatarColor | string | null;
  /** sm 32 · md 40 · lg 48, or any number of px (the spend card bubbles). */
  size?: keyof typeof SIZES | number;
  /** Small image at the bottom right (Apple subscriptions carry the Apple logo). */
  badge?: string | null;
  /** A small icon at the bottom right instead of an image (a paid recurring payment carries a check). */
  badgeIcon?: string | null;
  className?: string;
  style?: React.CSSProperties;
}

/** The face of a merchant, category, person or space: a rounded square with an emoji, a logo, an icon or an initial. */
export function Avatar({ emoji, img, icon, initial, color, size = 'md', badge, badgeIcon, className, style }: AvatarProps) {
  const marked = !!(badge || badgeIcon);
  const [broken, setBroken] = useState(false);
  const px = typeof size === 'number' ? size : SIZES[size];
  // radius follows the size: 32 and under xl, bigger 2xl, tiny ones lg
  const r = px <= 24 ? 'lg' : px <= 36 ? 'xl' : '2xl';
  const photo = img && !broken;
  const face = (
    <span
      className={['ds-avatar', `ds-avatar--r-${r}`, photo ? 'ds-avatar--photo' : initial && !emoji && !icon ? 'ds-avatar--initial' : '', !marked && className].filter(Boolean).join(' ')}
      style={{ width: px, height: px, fontSize: Math.round(px * 0.46), ...(photo || !color ? null : { background: `var(--category-${color})` }), ...(marked ? null : style) }}
      aria-hidden="true"
      data-slot="avatar"
    >
      {photo ? <img src={img} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} /> : icon ? <Icon name={icon} size={Math.round(px * 0.45)} /> : emoji || initial}
    </span>
  );
  if (!marked) return face;
  const b = Math.max(14, Math.round(px * 0.42));
  return (
    <span className={['ds-avatar-wrap', className].filter(Boolean).join(' ')} style={{ width: px, height: px, ...style }} aria-hidden="true">
      {face}
      {badge ? (
        <span className="ds-avatar-badge" style={{ width: b, height: b }}><img src={badge} alt="" loading="lazy" decoding="async" /></span>
      ) : (
        <span className="ds-avatar-badge ds-avatar-badge--icon" style={{ width: b, height: b }}><Icon name={badgeIcon!} size={Math.round(b * 0.6)} stroke={2.6} /></span>
      )}
    </span>
  );
}

/* shadcn parts: <AvatarRoot><AvatarImage src/><AvatarFallback>DG</AvatarFallback></AvatarRoot>. Same look as Avatar. */
const AvatarCtx = createContext<{ status: 'loading' | 'loaded' | 'error'; set: (s: 'loaded' | 'error') => void } | null>(null);

export function AvatarRoot({ size = 'md', color, className, style, children }: { size?: keyof typeof SIZES | number; color?: AvatarColor | string | null; className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const px = typeof size === 'number' ? size : SIZES[size];
  const r = px <= 24 ? 'lg' : px <= 36 ? 'xl' : '2xl';
  return (
    <AvatarCtx.Provider value={{ status, set: setStatus }}>
      <span data-slot="avatar" className={cn('ds-avatar', `ds-avatar--r-${r}`, status === 'loaded' && 'ds-avatar--photo', className)} style={{ width: px, height: px, fontSize: Math.round(px * 0.46), ...(status === 'loaded' || !color ? null : { background: `var(--category-${color})` }), ...style }}>
        {children}
      </span>
    </AvatarCtx.Provider>
  );
}

export function AvatarImage({ src, alt = '', className }: { src?: string | null; alt?: string; className?: string }) {
  const ctx = useContext(AvatarCtx);
  if (!src || ctx?.status === 'error') return null;
  return <img data-slot="avatar-image" src={src} alt={alt} loading="lazy" decoding="async" className={className} style={ctx?.status === 'loaded' ? undefined : { position: 'absolute', opacity: 0 }} onLoad={() => ctx?.set('loaded')} onError={() => ctx?.set('error')} />;
}

/** Shown until the image loads, or if it fails: an emoji, initials or an Icon. */
export function AvatarFallback({ children, className }: { children: React.ReactNode; className?: string }) {
  const ctx = useContext(AvatarCtx);
  if (ctx?.status === 'loaded') return null;
  return <span data-slot="avatar-fallback" className={className}>{children}</span>;
}
