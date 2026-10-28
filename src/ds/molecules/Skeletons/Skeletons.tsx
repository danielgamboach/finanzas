import React from 'react';
import { Bone } from '../../atoms/Utility/Utility';
import './Skeletons.css';

// widths that repeat in a fixed order, so lists look natural and don't jump between renders
const TITLES = [58, 44, 70, 52, 64, 40, 76, 48];
const DETAILS = [38, 52, 30, 46, 34, 56, 42, 28];
const VALUES = [64, 52, 72, 56, 60, 48, 68, 58];
const pick = (list: number[], i: number) => list[i % list.length];

/**
 * Wraps placeholders so assistive tech hears "Cargando…" once and skips the shapes.
 * Every skeleton below already sits inside one; use it to compose a screen of them.
 */
export function Loader({ label = 'Cargando…', children, className }: { label?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={['ds-loader', className].filter(Boolean).join(' ')} role="status" aria-busy="true" aria-live="polite">
      <span className="ds-loader__label">{label}</span>
      {children}
    </div>
  );
}

/** The big figure of a screen while it loads: label, number, the line under it and, if the screen has one, its button. */
export function SummarySkeleton({ action = false, align = 'start' }: { action?: boolean; align?: 'start' | 'center' }) {
  return (
    <div className={`ds-skel-summary is-${align}`}>
      <Bone width={96} height={12} />
      <Bone width={220} height={40} radius="lg" />
      <Bone width={180} height={12} />
      {action && <Bone width={76} height={28} radius="lg" />}
    </div>
  );
}

/** One ListRow while it loads. Same paddings as the real row, so nothing moves when data arrives. */
export function RowSkeleton({ index = 0, leading = 'avatar', value = true, action = false, below = false, density = 'md' }: {
  index?: number; leading?: 'avatar' | 'icon' | 'none'; value?: boolean; action?: boolean; below?: boolean; density?: 'md' | 'sm';
}) {
  return (
    <div className={`ds-row ds-row--${density} ds-skel-row`}>
      <div className="ds-row__main">
        {leading === 'avatar' && <Bone width={40} height={40} radius="2xl" />}
        {leading === 'icon' && <span className="ds-row__icon"><Bone width={16} height={16} radius="md" /></span>}
        <span className="ds-row__text">
          <Bone width={`${pick(TITLES, index)}%`} height={14} />
          <Bone width={`${pick(DETAILS, index)}%`} height={10} />
        </span>
        {value && <Bone width={pick(VALUES, index)} height={14} />}
        {action && <Bone width={56} height={28} radius="lg" />}
      </div>
      {below && <div className="ds-row__below"><Bone height={5} /></div>}
    </div>
  );
}

/** A ListGroup while it loads: its small title and a few rows. */
export function GroupSkeleton({ rows = 3, title = true, start = 0, ...row }: {
  rows?: number; title?: boolean; start?: number;
} & Omit<React.ComponentProps<typeof RowSkeleton>, 'index'>) {
  return (
    <div className="ds-group ds-skel-group">
      {title && <div className="ds-group__head"><Bone width={88} height={10} /></div>}
      <div className="ds-group__list">
        {Array.from({ length: rows }, (_, i) => <RowSkeleton key={i} index={start + i} {...row} />)}
      </div>
    </div>
  );
}

/** Movements while they load: a date and its rows, without a card (the Inicio sheet, an account, a category). */
export function TxListSkeleton({ days = 2, rows = 4, density = 'sheet' }: { days?: number; rows?: number; density?: 'sheet' | 'list' }) {
  return (
    <div className="ds-skel-tx">
      {Array.from({ length: days }, (_, d) => (
        <div key={d} className="ds-skel-tx__day">
          <div className="ds-skel-tx__head"><Bone width={d ? 72 : 96} height={10} /></div>
          {Array.from({ length: rows }, (_, i) => {
            const n = d * rows + i;
            return (
              <div key={i} className={`ds-tx ds-tx--${density} ds-skel-tx__row`}>
                <Bone width={40} height={40} radius="2xl" />
                <span className="ds-tx__mid">
                  <Bone width={`${pick(TITLES, n)}%`} height={density === 'sheet' ? 12 : 14} />
                  <Bone width={`${pick(DETAILS, n)}%`} height={10} />
                </span>
                <Bone width={pick(VALUES, n)} height={density === 'sheet' ? 12 : 14} />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** A form card while it loads: labels and 44 px fields. */
export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="ds-skel-form">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="ds-skel-form__field">
          <Bone width={pick([64, 88, 52, 76], i)} height={10} />
          <Bone height={44} radius="xl" />
        </div>
      ))}
    </div>
  );
}

/** Thin bars while a chart loads. */
export function ChartSkeleton({ bars = 24, height = 120 }: { bars?: number; height?: number }) {
  return (
    <div className="ds-skel-chart" style={{ height }}>
      {Array.from({ length: bars }, (_, i) => (
        <Bone key={i} width={3} height={`${18 + ((i * 37) % 70)}%`} />
      ))}
    </div>
  );
}
