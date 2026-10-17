import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Tx } from '../lib/types';
import { MovementsBrowser } from '../screens/Movimientos';
import { Icon } from '.';
import { TxRow } from './TxRow';

/**
 * The white sheet on the home screen. Collapsed it shows the latest movements under the summary;
 * pulled up it becomes the full list with search and filters. Horizontal swipes keep moving
 * between panels while it's collapsed.
 */
export function TxSheet({ open, setOpen, recent, topRef, focus }: { open: boolean; setOpen: (v: boolean) => void; recent: Tx[]; topRef: React.RefObject<HTMLElement | null>; focus: number }) {
  const sheet = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [rest, setRest] = useState(420); // collapsed offset from the sheet's natural (expanded) top
  const [drag, setDrag] = useState<number | null>(null);
  const [localFocus, setLocalFocus] = useState(0);
  const focusKey = focus + localFocus;

  // collapsed position: just under the summary card
  useLayoutEffect(() => {
    const measure = () => {
      const s = sheet.current, t = topRef.current;
      if (!s || !t) return;
      setRest(Math.max(120, t.offsetTop + t.offsetHeight + 20 - s.offsetTop));
    };
    measure();
    const ro = new ResizeObserver(measure);
    // the summary moves down when the AI line loads, so watch the whole top block too
    if (topRef.current) {
      ro.observe(topRef.current);
      if (topRef.current.parentElement) ro.observe(topRef.current.parentElement);
    }
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [topRef]);

  // vertical drags move the sheet; the browser keeps horizontal pans for the panels
  const state = useRef({ open, rest });
  state.current = { open, rest };
  useEffect(() => {
    const el = sheet.current;
    if (!el) return;
    let sx = 0, sy = 0, st = 0, decided = false, dragging = false, base = 0, last = 0, lastT = 0, v = 0, fromHead = false;
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      sx = t.clientX; sy = t.clientY; lastT = performance.now(); last = sy; v = 0;
      decided = false; dragging = false;
      base = state.current.open ? 0 : state.current.rest;
      st = body.current?.scrollTop ?? 0;
      fromHead = !!head.current?.contains(e.target as Node);
    };
    const move = (e: TouchEvent) => {
      const t = e.touches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (!decided) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        decided = true;
        if (Math.abs(dy) > Math.abs(dx)) dragging = !state.current.open || fromHead || (st <= 0 && dy > 0);
      }
      if (!dragging) return;
      e.preventDefault();
      const now = performance.now();
      v = (t.clientY - last) / Math.max(1, now - lastT);
      last = t.clientY; lastT = now;
      setDrag(Math.min(state.current.rest, Math.max(0, base + dy)));
    };
    const end = () => {
      if (!dragging) return;
      dragging = false;
      const moved = last - sy;
      if (!state.current.open) setOpen(moved < -50 || v < -0.4);
      else setOpen(!(moved > 70 || v > 0.4));
      setDrag(null);
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [setOpen]);

  // trackpads and mouse wheels
  function wheel(e: React.WheelEvent) {
    if (!open && e.deltaY > 12) setOpen(true);
    else if (open && e.deltaY < -12 && (body.current?.scrollTop ?? 0) <= 0) setOpen(false);
  }

  useEffect(() => {
    if (!open && body.current) body.current.scrollTop = 0;
  }, [open]);

  const y = drag ?? (open ? 0 : rest);
  return (
    <div
      ref={sheet}
      className={`tx-sheet${open ? ' open' : ''}${drag !== null ? ' dragging' : ''}`}
      style={{ transform: `translateY(${y}px)` }}
      onWheel={wheel}
      aria-label="Movimientos"
    >
      <div ref={head} className="tx-sheet-head">
        <button className="tx-sheet-grab" onClick={() => setOpen(!open)} aria-label={open ? 'Cerrar movimientos' : 'Ver todos los movimientos'} aria-expanded={open} />
        <div className="tx-sheet-bar">
          <button className="icon-btn" onClick={() => { setLocalFocus((n) => n + 1); setOpen(true); }} aria-label="Buscar movimientos"><Icon name="search" size={18} /></button>
          <button className="tx-sheet-title" onClick={() => setOpen(!open)}>Movimientos</button>
          {open ? (
            <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Cerrar"><Icon name="chevDown" size={20} /></button>
          ) : (
            <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Filtrar movimientos"><Icon name="sliders" size={18} /></button>
          )}
        </div>
      </div>
      <div ref={body} className="tx-sheet-body">
        {open ? (
          <MovementsBrowser autoFocus={focusKey > 0} key={focusKey} />
        ) : recent.length === 0 ? (
          <div className="empty center-text">Todavía no hay movimientos. Tocá “Gasto” para agregar uno.</div>
        ) : (
          <div className="tx-sheet-recent">
            {recent.map((t) => <TxRow key={t.id} t={t} showDate />)}
          </div>
        )}
      </div>
      {!open && <div className="tx-sheet-fade" aria-hidden="true" />}
    </div>
  );
}
