/**
 * How much of the screen the on-screen keyboard covers, as --kb on <html> (0 when it's closed). iOS doesn't
 * shrink the page for the keyboard, so anything pinned to the bottom (the save bar) would hide behind it;
 * with this it sits right on top of the keyboard. Android resizes the page itself (interactive-widget), so it stays 0.
 */
export function watchKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  let raf = 0;
  const paint = () => {
    raf = 0;
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    const open = kb > 80;
    root.style.setProperty('--kb', `${open ? kb : 0}px`);
    root.classList.toggle('kb-open', open);
  };
  const on = () => {
    if (!raf) raf = requestAnimationFrame(paint);
  };
  vv.addEventListener('resize', on);
  vv.addEventListener('scroll', on);
  paint();
}

/**
 * iOS opens the keyboard only when a field takes focus inside the tap itself. The form mounts a beat later, so the
 * tap that opens it ("+") focuses a hidden field right away; the form's amount then takes the focus from it and the
 * keyboard stays up. Only on touch screens; it cleans itself up.
 */
export function primeKeyboard() {
  if (typeof matchMedia === 'undefined' || !matchMedia('(pointer: coarse)').matches) return;
  const el = document.createElement('input');
  el.setAttribute('inputmode', 'decimal');
  el.setAttribute('aria-hidden', 'true');
  el.tabIndex = -1;
  el.className = 'kb-primer';
  document.body.appendChild(el);
  el.focus({ preventScroll: true });
  const drop = () => el.remove();
  el.addEventListener('blur', drop, { once: true });
  window.setTimeout(() => {
    if (document.activeElement === el) el.blur();
    drop();
  }, 1500);
}
