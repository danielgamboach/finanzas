/**
 * Appearance: dark (the default), light, or whatever the phone/computer uses. Saved per device in localStorage
 * and applied as the `.light` class on <html> (the light tokens), before the app draws, so there's no flash.
 */
export type ThemePref = 'dark' | 'light' | 'system';
const KEY = 'finanzas.theme';
const media = () => window.matchMedia?.('(prefers-color-scheme: light)');

export function getTheme(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'system' ? v : 'dark';
  } catch {
    return 'dark';
  }
}

function apply(pref: ThemePref) {
  const light = pref === 'light' || (pref === 'system' && !!media()?.matches);
  const root = document.documentElement;
  root.classList.toggle('light', light);
  root.style.colorScheme = light ? 'light' : 'dark';
  // the browser bar takes the page background
  const bg = getComputedStyle(root).getPropertyValue('--background').trim();
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
}

export function setTheme(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* storage unavailable: still applies for this visit */
  }
  apply(pref);
}

/** Call once at startup: applies the saved choice and follows the system while "Sistema" is chosen. */
export function initTheme() {
  apply(getTheme());
  media()?.addEventListener?.('change', () => getTheme() === 'system' && apply('system'));
}
