import { useEffect, useRef } from 'react';

type Box = { x: number; y: number; w: number; h: number };
interface Item { src: HTMLElement; dst: HTMLElement; ghost: HTMLDivElement; content: HTMLElement; a: Box; b: Box; ra: number; rb: number }

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * While swiping from Inicio to Cuentas, the cards peeking on the right of home travel, grow and
 * settle exactly where they sit in the wallet. Driven by the pager's scroll, so it follows the
 * finger both ways. Real cards are hidden only while the ghosts are on screen.
 */
export function CardMorph({ pager }: { pager: React.RefObject<HTMLDivElement | null> }) {
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = pager.current, root = layer.current;
    if (!el || !root) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let items: Item[] | null = null;
    let raf = 0;

    const clear = () => {
      if (!items) return;
      for (const it of items) {
        it.src.style.visibility = '';
        it.dst.style.visibility = '';
      }
      root.replaceChildren();
      items = null;
    };

    const build = (s: number, W: number) => {
      const srcs = Array.from(document.querySelectorAll<HTMLElement>('.card-peek [data-acc]'));
      const out: Item[] = [];
      srcs.forEach((src, i) => {
        const dst = document.querySelector<HTMLElement>(`.wstack [data-acc="${src.dataset.acc}"]`);
        if (!dst) return;
        const ra = src.getBoundingClientRect(), rb = dst.getBoundingClientRect();
        // where each one sits when its panel is fully on screen
        const a = { x: ra.left + (s - W), y: ra.top, w: ra.width, h: ra.height };
        const b = { x: rb.left + (s - 2 * W), y: rb.top, w: rb.width, h: rb.height };
        const ghost = document.createElement('div');
        ghost.className = 'morph-card';
        const cs = getComputedStyle(dst);
        ghost.style.background = cs.backgroundColor;
        ghost.style.color = cs.color;
        ghost.style.zIndex = String(i);
        ghost.style.width = `${rb.width}px`;
        ghost.style.height = `${rb.height}px`;
        const content = dst.cloneNode(true) as HTMLElement;
        content.removeAttribute('data-acc');
        content.classList.add('morph-content');
        content.style.cssText += `;width:${rb.width}px;height:${rb.height}px;visibility:visible;view-transition-name:none`;
        ghost.appendChild(content);
        root.appendChild(ghost);
        src.style.visibility = 'hidden';
        dst.style.visibility = 'hidden';
        out.push({ src, dst, ghost, content, a, b, ra: parseFloat(getComputedStyle(src).borderRadius) || 22, rb: parseFloat(cs.borderRadius) || 18 });
      });
      return out.length ? out : null;
    };

    const frame = () => {
      raf = 0;
      const W = el.clientWidth;
      const s = el.scrollLeft;
      const t = s / W - 1; // 0 on home, 1 on cuentas
      if (reduced || t <= 0.004 || t >= 0.996) return clear();
      if (!items) items = build(s, W);
      if (!items) return;
      const left = 2 * W - s; // where the Cuentas panel starts on screen
      for (const it of items) {
        // linear and glued to the finger: the pager's own momentum is the only easing
        // sideways it lines up with the panel by mid-gesture, so it barely overlaps Inicio
        const x = left + lerp(it.a.x - W, it.b.x, Math.min(1, t * 2));
        const y = lerp(it.a.y, it.b.y, t);
        const w = lerp(it.a.w, it.b.w, t);
        const h = lerp(it.a.h, it.b.h, t);
        const r = lerp(it.ra, it.rb, t);
        // the ghost keeps its final size; only transform and the clip change, so nothing re-lays out
        it.ghost.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        it.ghost.style.clipPath = `inset(0 ${it.b.w - w}px ${it.b.h - h}px 0 round ${r}px)`;
        it.content.style.opacity = String(clamp((t - 0.6) / 0.35));
      }
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onResize = () => clear();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(raf);
      clear();
    };
  }, [pager]);

  return <div ref={layer} className="morph-layer" aria-hidden="true" />;
}
