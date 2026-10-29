import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MenuCtx } from '../lib/menu';
import { useRoute } from '../store';
import { AppMenu, MENU_ROUTES } from '../ui/AppMenu';
import { FormLayer, formSpecOf, type FormLayerHandle } from '../ui/FormLayer';
import { swipeBlocked } from '../lib/swipe';
import { Home } from './Home';
import { Cuentas } from './Patrimonio';
import { Categorias, Tendencias } from './Presupuesto';
import { Recurrentes } from './Recurrentes';
import { Ajustes } from './Ajustes';

export { useMenu } from '../lib/menu';

export const isShellRoute = (r: string | undefined) => MENU_ROUTES.has(r || '');
const routeOfHash = () => location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] || '';
const menuWidth = () => Math.min(320, Math.round(innerWidth * 0.84));
const MS = 320;

function Page({ route, open, setOpen, focus }: { route: string; open: boolean; setOpen: (v: boolean) => void; focus: number }) {
  switch (route) {
    case 'cuentas':
    case 'patrimonio':
      return <Cuentas />;
    case 'categorias':
    case 'analisis':
    case 'presupuesto':
      return <Categorias />;
    case 'tendencias':
      return <Tendencias />;
    case 'recurrentes':
      return <Recurrentes />;
    case 'ajustes':
      return <Ajustes />;
    default:
      return <Home open={open} setOpen={setOpen} focus={focus} />;
  }
}

/**
 * The phone frame. The page sits on top of two layers: swiping right (or the menu button) slides the page to the
 * right and uncovers the menu, like Claude's app; on Inicio, swiping left (or +) slides it to the left and uncovers
 * "Nuevo movimiento", which sits under the page on the right side. Same motion, mirrored.
 */
export function Shell({ route }: { route: string }) {
  const path = useRoute();
  const isHome = route === '' || route === 'movimientos';
  const [sheet, setSheetState] = useState(route === 'movimientos');
  const [menu, setMenu] = useState(false);
  const [w, setW] = useState(menuWidth);
  const root = useRef<HTMLDivElement>(null);
  const form = useRef<FormLayerHandle>(null);
  const menuEl = useRef<HTMLElement>(null);
  const prog = useRef(0);
  const spec = formSpecOf(path);

  const paintMenu = useCallback((p: number, animate: boolean) => {
    prog.current = p;
    const r = root.current;
    if (!r) return;
    r.classList.toggle('dragging', !animate);
    r.style.setProperty('--menu-p', String(p));
    r.classList.toggle('menu-on', p > 0);
  }, []);
  const openMenu = useCallback(() => {
    paintMenu(1, true);
    setMenu(true);
  }, [paintMenu]);
  const closeMenu = useCallback(() => {
    paintMenu(0, true);
    setMenu(false);
  }, [paintMenu]);
  const ctx = useRef({ open: openMenu });
  ctx.current.open = openMenu;

  // the mirror of the menu: the page slides off to the left and uncovers the form underneath
  const paintForm = useCallback((p: number, animate: boolean) => {
    const r = root.current;
    if (!r) return;
    r.classList.toggle('form-dragging', !animate);
    r.classList.toggle('form-on', p > 0);
    r.style.setProperty('--form-p', String(p));
  }, []);

  useLayoutEffect(() => {
    const on = () => setW(menuWidth());
    addEventListener('resize', on);
    return () => removeEventListener('resize', on);
  }, []);

  // the movements sheet on Inicio is #/movimientos; links elsewhere open or close it
  useEffect(() => {
    const on = () => {
      const r = routeOfHash();
      if (r === '' || r === 'movimientos') setSheetState(r === 'movimientos');
    };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  // keep the address in sync without re-rendering the router, so back from a detail lands here
  useEffect(() => {
    const r = routeOfHash();
    if (r !== '' && r !== 'movimientos') return;
    const h = sheet ? '#/movimientos' : '#/';
    if (location.hash !== h && !(h === '#/' && (location.hash === '' || location.hash === '#'))) history.replaceState(null, '', h);
  }, [sheet]);
  const setSheet = useCallback((v: boolean) => setSheetState(v), []);

  // a new page always closes the menu
  useEffect(() => {
    if (prog.current > 0) closeMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  // Esc closes the menu
  useEffect(() => {
    if (!menu) return;
    const on = (e: KeyboardEvent) => e.key === 'Escape' && closeMenu();
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [menu, closeMenu]);

  // the swipes: right opens the menu, left closes it; on Inicio, left also brings the form
  const state = useRef({ isHome, sheet, formOpen: !!spec });
  state.current = { isHome, sheet, formOpen: !!spec };
  useEffect(() => {
    const r = root.current;
    if (!r) return;
    let sx = 0, sy = 0, st = 0, dx = 0, from = 0;
    let mode: 'none' | 'wait' | 'menu' | 'form' = 'none';
    const start = (e: TouchEvent) => {
      mode = 'none';
      const t = e.target as Element;
      if (e.touches.length !== 1 || state.current.formOpen || t.closest('.form-layer')) return;
      // with the menu open, only the page edge (or the menu itself) can close it
      if (prog.current === 0 && swipeBlocked(t, r)) return;
      if (prog.current === 0 && t.closest('.app-menu')) return;
      if (document.querySelector('.sheet-backdrop, .txd-backdrop, [role="dialog"]:not(.form-layer [role="dialog"])')) return;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      st = Date.now();
      dx = 0;
      from = prog.current;
      mode = 'wait';
    };
    const move = (e: TouchEvent) => {
      if (mode === 'none') return;
      const x = e.touches[0].clientX - sx, y = e.touches[0].clientY - sy;
      if (mode === 'wait') {
        if (Math.abs(x) < 10 && Math.abs(y) < 10) return;
        if (Math.abs(x) < Math.abs(y) * 1.2) return void (mode = 'none');
        if (from > 0 || x > 0) mode = from === 0 && x < 0 ? 'none' : 'menu';
        else if (state.current.isHome && !state.current.sheet) {
          mode = 'form';
          form.current?.peekStart();
        } else mode = 'none';
        if (mode === 'none') return;
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
      e.preventDefault();
      dx = x;
      const width = r.clientWidth;
      if (mode === 'menu') paintMenu(Math.max(0, Math.min(1, from + x / menuWidth())), false);
      else form.current?.peekMove(-x / width);
    };
    const end = () => {
      if (mode === 'none' || mode === 'wait') return void (mode = 'none');
      const speed = dx / Math.max(1, Date.now() - st);
      if (mode === 'menu') {
        const p = prog.current;
        const open = speed > 0.5 ? true : speed < -0.5 ? false : p > 0.5;
        if (open) openMenu();
        else closeMenu();
      } else {
        const p = -dx / r.clientWidth;
        const commit = p > 0.35 || (p > 0.08 && speed < -0.5);
        form.current?.peekEnd(commit);
        if (commit) location.hash = '/agregar';
      }
      mode = 'none';
    };
    r.addEventListener('touchstart', start, { passive: true });
    r.addEventListener('touchmove', move, { passive: false });
    r.addEventListener('touchend', end);
    r.addEventListener('touchcancel', end);
    return () => {
      r.removeEventListener('touchstart', start);
      r.removeEventListener('touchmove', move);
      r.removeEventListener('touchend', end);
      r.removeEventListener('touchcancel', end);
    };
  }, [paintMenu, openMenu, closeMenu]);

  // mouse and keyboard can't swipe: the menu button and + do it all; a click on the page closes the menu
  const stageKey = isHome ? 'home' : route === 'patrimonio' ? 'cuentas' : ['analisis', 'presupuesto'].includes(route) ? 'categorias' : route;
  return (
    <MenuCtx.Provider value={ctx.current}>
      <div ref={root} className="shell" style={{ '--menu-w': `${w}px` } as React.CSSProperties}>
        <div className="shell-menu" aria-hidden={!menu} inert={!menu || undefined}>
          <AppMenu route={route} onClose={closeMenu} menuRef={menuEl} />
        </div>
        <div className="shell-stage" aria-hidden={menu || !!spec} inert={menu || !!spec || undefined}>
          <section key={stageKey} className={isHome ? 'panel panel-home' : 'panel'} aria-label="Contenido">
            <Page route={route} open={sheet} setOpen={setSheet} focus={0} />
          </section>
        </div>
        <button className="shell-scrim" aria-label="Cerrar menú" tabIndex={menu ? 0 : -1} onClick={closeMenu} />
        <FormLayer ref={form} spec={spec} onProgress={paintForm} />
      </div>
    </MenuCtx.Provider>
  );
}

export { MS as SHELL_MS };
