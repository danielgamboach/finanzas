import { createContext, useContext } from 'react';

/** Opens the phone's side menu from a page header. Null outside the phone shell (desktop has its sidebar). */
export const MenuCtx = createContext<{ open: () => void } | null>(null);
export const useMenu = () => useContext(MenuCtx);
