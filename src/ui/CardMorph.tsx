import { useEffect, useRef } from 'react';

type Box = { x: number; y: number; w: number; h: number };
interface Item { src: HTMLElement; dst: HTMLElement; ghost: HTMLDivElement; content: HTMLElement; a: Box; b: Box; ra: number; rb: number }

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
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
      const n = items.length;
      const step = 0.07;
      items.forEach((it, k) => {
        // the front card leads, the ones behind follow a beat later
        const tk = clamp((t - (n - 1 - k) * step) / (1 - (n - 1) * step));
        const e = ease(tk);
        const x = lerp(it.a.x, it.b.x, e);
        const y = lerp(it.a.y, it.b.y, ease(clamp(tk * 1.15)));
        const w = lerp(it.a.w, it.b.w, e);
        const h = lerp(it.a.h, it.b.h, e);
        it.ghost.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        it.ghost.style.width = `${w}px`;
        it.ghost.style.height = `${h}px`;
        it.ghost.style.borderRadius = `${lerp(it.ra, it.rb, e)}px`;
        it.content.style.opacity = String(clamp((e - 0.55) / 0.4));
      });
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
