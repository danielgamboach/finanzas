import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../ui';
import { CardMorph } from '../ui/CardMorph';
import { Analisis } from './Presupuesto';
import { Home } from './Home';
import { Cuentas } from './Patrimonio';

const HASH = ['#/analisis', '#/', '#/cuentas'];

export function panelOf(route: string | undefined) {
  if (route === 'analisis' || route === 'presupuesto') return 0;
  if (route === 'cuentas' || route === 'patrimonio') return 2;
  return 1;
}
const routeOfHash = () => (location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] || '');

/**
 * The three main screens side by side: Análisis ← Inicio → Cuentas.
 * Native horizontal scroll with snapping does the swiping; the URL follows the visible panel.
 */
export function Shell({ route }: { route: string }) {
  const pager = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(panelOf(route));
  const [open, setOpenState] = useState(route === 'movimientos');
  const [focus, setFocus] = useState(0);
  const pill = useRef<HTMLSpanElement>(null);

  // the bottom bar's white pill follows the finger, not just the final panel
  useEffect(() => {
    const el = pager.current;
    if (!el) return;
    let raf = 0;
    const paint = () => {
      raf = 0;
      const x = el.scrollLeft / Math.max(1, el.clientWidth);
      if (pill.current) pill.current.style.transform = `translateX(${x * 100}%)`;
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };
    paint();
    el.addEventListener('scroll', on, { passive: true });
    return () => {
      el.removeEventListener('scroll', on);
      cancelAnimationFrame(raf);
    };
  }, []);

  const scrollTo = useCallback((i: number, smooth: boolean) => {
    const el = pager.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // land on the right panel without animation
  useLayoutEffect(() => {
    scrollTo(panelOf(route), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // links elsewhere in the app (#/cuentas, #/movimientos…) move the shell too
  useEffect(() => {
    const on = () => {
      const r = routeOfHash();
      if (!['', 'analisis', 'presupuesto', 'cuentas', 'patrimonio', 'movimientos'].includes(r)) return;
      const i = panelOf(r);
      setIdx(i);
      scrollTo(i, true);
      setOpenState(r === 'movimientos');
    };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, [scrollTo]);

  // follow swipes
  useEffect(() => {
    const el = pager.current;
    if (!el) return;
    let t = 0;
    const on = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => setIdx(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))), 90);
    };
    el.addEventListener('scroll', on, { passive: true });
    const keep = () => scrollTo(idxRef.current, false); // stay on the same panel when the window resizes
    addEventListener('resize', keep);
    return () => {
      el.removeEventListener('scroll', on);
      removeEventListener('resize', keep);
    };
  }, [scrollTo]);
  const idxRef = useRef(idx);
  idxRef.current = idx;

  // keep the address in sync without re-rendering the router, so back from a detail lands here
  useEffect(() => {
    const h = idx === 1 && open ? '#/movimientos' : HASH[idx];
    if (location.hash !== h && !(h === '#/' && (location.hash === '' || location.hash === '#'))) history.replaceState(null, '', h);
  }, [idx, open]);

  const setOpen = useCallback((v: boolean) => setOpenState(v), []);
  const goPanel = (i: number) => {
    if (open && i !== 1) setOpenState(false);
    setIdx(i);
    scrollTo(i, true);
  };

  return (
    <>
      <div ref={pager} className={open ? 'pager locked' : 'pager'}>
        <section className="panel" aria-label="Análisis" aria-hidden={idx !== 0}>
          <Analisis />
        </section>
        <section className="panel panel-home" aria-label="Inicio" aria-hidden={idx !== 1}>
          <Home open={open} setOpen={setOpen} goPanel={goPanel} focus={focus} onSearch={() => { setFocus((n) => n + 1); setOpenState(true); }} />
        </section>
        <section className="panel" aria-label="Cuentas" aria-hidden={idx !== 2}>
          <Cuentas />
        </section>
      </div>
      <CardMorph pager={pager} />
      <nav className="pnav" aria-label="Navegación principal">
        <span className="pnav-track" aria-hidden="true"><span ref={pill} className="pnav-pill" /></span>
        {([
          ['grid', 'Análisis'],
          ['house', 'Inicio'],
          ['cards', 'Cuentas'],
        ] as const).map(([icon, label], i) => (
          <button key={icon} className={i === idx ? 'pnav-item on' : 'pnav-item'} aria-label={label} aria-current={i === idx ? 'page' : undefined} onClick={() => (i === 1 && idx === 1 && open ? setOpenState(false) : goPanel(i))}>
            <Icon name={icon} size={i === 1 ? 24 : 23} stroke={1.8} />
          </button>
        ))}
      </nav>
    </>
  );
}
