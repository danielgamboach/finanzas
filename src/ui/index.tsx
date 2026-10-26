import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { navigateBack, useApp } from '../store';
import { moneyParts } from '../lib/format';
import { useDragToClose } from './useDragToClose';

export const PALETTE: Record<string, [string, string]> = {
  mint: ['var(--category-mint-subtle)', 'var(--category-mint)'],
  peach: ['var(--category-peach-subtle)', 'var(--category-peach)'],
  sky: ['var(--category-sky-subtle)', 'var(--category-sky)'],
  butter: ['var(--category-butter-subtle)', 'var(--category-butter)'],
  lilac: ['var(--category-lilac-subtle)', 'var(--category-lilac)'],
  pink: ['var(--category-pink-subtle)', 'var(--category-pink)'],
  cyan: ['var(--category-cyan-subtle)', 'var(--category-cyan)'],
  gray: ['var(--category-gray-subtle)', 'var(--category-gray)'],
};
export const COLOR_NAMES = Object.keys(PALETTE);
export const tint = (c?: string | null, strong = true) => (PALETTE[c || 'gray'] || PALETTE.gray)[strong ? 1 : 0];

export { Icon } from '../ds/atoms/Icon/Icon';
import { Icon } from '../ds/atoms/Icon/Icon';

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
