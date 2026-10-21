import { useEffect, useState } from 'react';

/** Wide screens with room for a sidebar get the desktop layout. */
export const DESKTOP_QUERY = '(min-width: 1024px)';
export const isDesktopNow = () => typeof window !== 'undefined' && !!window.matchMedia?.(DESKTOP_QUERY).matches;

export function useDesktop() {
  const [d, setD] = useState(isDesktopNow);
  useEffect(() => {
    const m = window.matchMedia(DESKTOP_QUERY);
    const on = () => setD(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return d;
}
