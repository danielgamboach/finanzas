import React, { useEffect, useState } from 'react';
import { go, useApp } from '../store';
import { moneyParts } from '../lib/format';
import { useDragToClose } from './useDragToClose';

export const PALETTE: Record<string, [string, string]> = {
  mint: ['#EFF7EF', '#CDEBD3'],
  peach: ['#FDF2E6', '#F7D7B5'],
  sky: ['#EDF3FD', '#CFE0F8'],
  butter: ['#FDF7E3', '#F6E3A0'],
  lilac: ['#F3F0FC', '#DCD3F5'],
  pink: ['#FCEEF3', '#F6CFDF'],
  cyan: ['#ECF7F8', '#BFE6EC'],
  gray: ['#F5F5F3', '#E2E2DE'],
};
export const COLOR_NAMES = Object.keys(PALETTE);
export const tint = (c?: string | null, strong = true) => (PALETTE[c || 'gray'] || PALETTE.gray)[strong ? 1 : 0];

const paths: Record<string, string> = {
  home: 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  pie: 'M12 3v9h9M20.5 14.5A9 9 0 1 1 9.5 3.5',
  wallet: 'M3 7h15a3 3 0 0 1 3 3v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM3 7l12-4 2 4M16 13.5h2',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  chevDown: 'M6 9l6 6 6-6',
  chevRight: 'M9 18l6-6-6-6',
  chevLeft: 'M15 18l-6-6 6-6',
  search: 'M18 11a7 7 0 1 1-14 0a7 7 0 1 1 14 0M20 20l-4-4',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  arrowUpRight: 'M7 17L17 7M9 7h8v8',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  check: 'M5 12l5 5L20 7',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  back: 'M15 18l-6-6 6-6',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  refresh: 'M20 11a8 8 0 1 0-2.4 5.7M20 4v7h-7',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  pencil: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
};

export function Icon({ name, size = 20, stroke = 2 }: { name: keyof typeof paths | string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] || ''} />
    </svg>
  );
}

export function Emo({ e, color, size = 48 }: { e: string; color?: string | null; size?: number }) {
  return (
    <span className="emo" aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.46, background: tint(color) }}>
      {e}
    </span>
  );
}

export function BigMoney({ crc, size = 60 }: { crc: number; size?: number }) {
  const { cur, fx } = useApp();
  const p = moneyParts(crc, cur, fx);
  return (
    <span className="big-money" style={{ fontSize: size }}>
      {p.negative && <span className="bm-neg">−</span>}
      <span className="bm-sym" style={{ fontSize: Math.round(size * 0.4) }}>{p.sym}</span>
      {p.num}
    </span>
  );
}

export function Nav({ active }: { active: 'home' | 'budget' | 'rec' | 'accounts' | null }) {
  const items = [
    { k: 'home', label: 'Inicio', icon: 'home', href: '/' },
    { k: 'budget', label: 'Presupuesto', icon: 'pie', href: '/presupuesto' },
    { k: 'rec', label: 'Recurrentes', icon: 'repeat', href: '/recurrentes' },
    { k: 'accounts', label: 'Cuentas', icon: 'wallet', href: '/cuentas' },
  ] as const;
  return (
    <div className="nav-wrap">
      <nav className="nav" aria-label="Navegación principal">
        {items.map((it) =>
          it.k === active ? (
            <a key={it.k} href={`#${it.href}`} className="nav-active" aria-current="page">
              <Icon name={it.icon} size={20} />
              {it.label}
            </a>
          ) : (
            <a key={it.k} href={`#${it.href}`} className="nav-item" aria-label={it.label}>
              <Icon name={it.icon} size={22} />
            </a>
          ),
        )}
      </nav>
      <a href="#/agregar" className="nav-plus" aria-label="Agregar movimiento">
        <Icon name="plus" size={26} stroke={2.6} />
      </a>
    </div>
  );
}

export function SpacePill() {
  const { space, spaces, setSpaceId, bump } = useApp();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);
  if (!space) return <span />;
  return (
    <div className="space-pill-wrap" onClick={(e) => e.stopPropagation()}>
      <button className="chip-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="chip-emoji">{space.emoji}</span>
        {space.name}
        <Icon name="chevDown" size={16} stroke={2.4} />
      </button>
      {open && (
        <div className="menu" role="menu">
          {spaces.map((s) => (
            <button
              key={s.id}
              role="menuitemradio"
              aria-checked={s.id === space.id}
              className={s.id === space.id ? 'menu-item on' : 'menu-item'}
              onClick={() => {
                setSpaceId(s.id);
                bump();
                setOpen(false);
              }}
            >
              <span className="chip-emoji">{s.emoji}</span>
              <span className="grow">{s.name}</span>
              <span className="menu-meta">{s.kind === 'shared' ? 'Compartido' : 'Privado'}</span>
            </button>
          ))}
          <button className="menu-item muted" onClick={() => go('/ajustes')}>
            <span className="chip-emoji">⚙️</span>
            <span className="grow">Espacios y ajustes</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function TopBar({ extra }: { extra?: React.ReactNode }) {
  const { cur, toggleCur, profile } = useApp();
  return (
    <header className="topbar">
      <SpacePill />
      <div className="row gap8">
        {extra}
        <button className="round" onClick={toggleCur} aria-label={cur === 'USD' ? 'Mostrando dólares. Cambiar a colones' : 'Mostrando colones. Cambiar a dólares'}>
          {cur === 'USD' ? '$' : '₡'}
        </button>
        <a href="#/ajustes" className="round dark" aria-label="Perfil y ajustes">
          {(profile?.name || 'U').charAt(0).toUpperCase()}
        </a>
      </div>
    </header>
  );
}

export function Segmented<T extends string>({ value, options, onChange, dark = true }: { value: T; options: [T, string][]; onChange: (v: T) => void; dark?: boolean }) {
  return (
    <div className={dark ? 'seg' : 'seg seg-light'} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(([v, label]) => (
        <button key={v} aria-pressed={v === value} className={v === value ? 'seg-on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const dragRef = useDragToClose<HTMLDivElement>(onClose, 'self');
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div ref={dragRef} className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="grabber" />
        <div className="row between">
          <h2 className="h2">{title}</h2>
          <button className="round light" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" size={18} stroke={2.4} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toast() {
  const { toastMsg } = useApp();
  if (!toastMsg) return null;
  return (
    <div className="toast" role="status">
      {toastMsg}
    </div>
  );
}

export function Loading() {
  return <div className="loading" aria-label="Cargando">Cargando…</div>;
}
