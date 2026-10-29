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
