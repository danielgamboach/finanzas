import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { navigateBack, useApp } from '../store';
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
  chevUp: 'M6 15l6-6 6 6',
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
  camera: 'M3 8.5h3.5L8.5 5.5h7l2 3H21V19H3zM12 16.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
  grid: 'M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z',
  house: 'M4 10.5L12 4l8 6.5V20h-5.5v-5.5h-5V20H4z',
  cards: 'M3 9h18v11H3zM5 6h14M7.5 3h9M15.5 15.5h2.5',
  chart: 'M4 4v16h16M7.5 15l4-4.5 3 3L20 8M15.5 8H20v4.5',
  plusCircle: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 8v8M8 12h8',
  sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 4.5v5M8 14.5v5',
  user: 'M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0',
  gear: 'M12 15a3 3 0 1 0 0-6a3 3 0 0 0 0 6zM19.4 13.5l1.6 1.2-2 3.4-1.9-.8a7 7 0 0 1-2.1 1.2L14.7 21h-4l-.3-2.1a7 7 0 0 1-2.1-1.2l-1.9.8-2-3.4 1.6-1.2a7 7 0 0 1 0-2.4L4.4 10.3l2-3.4 1.9.8a7 7 0 0 1 2.1-1.2L10.7 4h4l.3 2.5a7 7 0 0 1 2.1 1.2l1.9-.8 2 3.4-1.6 1.2a7 7 0 0 1 0 2z',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5h4',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  sparkle: 'M11 3.5l1.9 5.1 5.1 1.9-5.1 1.9L11 17.5l-1.9-5.1L4 10.5l5.1-1.9zM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
};

export function Icon({ name, size = 20, stroke = 2 }: { name: keyof typeof paths | string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] || ''} />
    </svg>
  );
}

/** A round face: the merchant's photo or the category emoji. `badge` adds a small logo at the bottom right (e.g. Apple). */
export function Emo({ e, color, size = 48, img, badge }: { e: string; color?: string | null; size?: number; img?: string | null; badge?: string | null }) {
  if (badge) {
    const b = Math.max(14, Math.round(size * 0.42));
    return (
      <span className="emo-wrap" aria-hidden="true" style={{ width: size, height: size }}>
        <Emo e={e} color={color} size={size} img={img} />
        <span className="emo-badge" style={{ width: b, height: b }}>
          <img src={badge} alt="" loading="lazy" decoding="async" />
        </span>
      </span>
    );
  }
  return <Face e={e} color={color} size={size} img={img} />;
}

function Face({ e, color, size, img }: { e: string; color?: string | null; size: number; img?: string | null }) {
  const [broken, setBroken] = useState(false);
  if (img && !broken) {
    return (
      <span className="emo photo" aria-hidden="true" style={{ width: size, height: size }}>
        <img src={img} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
      </span>
    );
  }
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

/** Header for secondary screens: back on the left, optional title and action on the right. */
export function BackBar({ title, right }: { title?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <header className="topbar">
      <button className="round" onClick={navigateBack} aria-label="Volver"><Icon name="back" /></button>
      {title ? <h1 className="h2 topbar-title">{title}</h1> : <span />}
      {right || <span style={{ width: 48 }} />}
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
  // rendered at the root so it covers the panels and the bottom bar
  return createPortal(
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
    </div>,
    document.body,
  );
}

export function Toast() {
  const { toastMsg, toastUndo, toast, clearToast, bump } = useApp();
  const [busy, setBusy] = useState(false);
  if (!toastMsg) return null;
  async function undo() {
    if (!toastUndo) return;
    setBusy(true);
    try {
      await toastUndo();
      bump();
      toast('Listo, se deshizo');
    } catch {
      toast('No se pudo deshacer');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={toastUndo ? 'toast has-undo' : 'toast'} role="status">
      <span>{toastMsg}</span>
      {toastUndo && <button className="toast-undo" onClick={undo} disabled={busy}>Deshacer</button>}
      {toastUndo && <button className="toast-x" onClick={clearToast} aria-label="Cerrar"><Icon name="close" size={14} stroke={2.6} /></button>}
    </div>
  );
}

export function Loading() {
  return <div className="loading" aria-label="Cargando">Cargando…</div>;
}
