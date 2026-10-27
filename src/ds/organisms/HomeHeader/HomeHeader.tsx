import React from 'react';
import './HomeHeader.css';

/** Top bar of Inicio: the profile button and Kai next to it (62 px). */
export function HomeHeader({ children }: { children: React.ReactNode }) {
  return <header className="ds-home-header">{children}</header>;
}
