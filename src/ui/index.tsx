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
import { Avatar, GroupSkeleton, Loader, PageHeader, SheetHeader, Segmented as DsSegmented, Toast as DsToast } from '../ds';

/** A merchant's or category's face: the photo, or the emoji on the category color. Thin wrapper over the DS Avatar. */
export function Emo({ e, color, size = 48, img, badge }: { e: string; color?: string | null; size?: number; img?: string | null; badge?: string | null }) {
  return <Avatar emoji={e} color={color || 'gray'} size={size} img={img} badge={badge} />;
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

/** Header for secondary screens: back, title and actions. A PageHeader underneath. */
export function BackBar({ title, right }: { title?: React.ReactNode; right?: React.ReactNode }) {
  return <PageHeader title={title || ''} onBack={navigateBack} actions={right} />;
}

/** App shorthand for the DS Segmented: options as [value, label] pairs. */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void; dark?: boolean }) {
  return <DsSegmented value={value} options={options.map(([v, label]) => ({ value: v, label }))} onChange={onChange} />;
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
        <SheetHeader title={title} onClose={onClose} className="sheet-head" />
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Toast() {
  const { toastMsg, toastUndo, toast, bump } = useApp();
  const [busy, setBusy] = useState(false);
  if (!toastMsg) return null;
  async function undo() {
    if (!toastUndo || busy) return;
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
  return <DsToast className="toast" message={toastMsg} onUndo={toastUndo ? undo : undefined} />;
}

/** Generic placeholder: a group of rows. Screens use the shaped skeletons in ./Skeletons. */
export function Loading() {
  return <Loader><GroupSkeleton rows={4} title={false} /></Loader>;
}
