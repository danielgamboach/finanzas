import React from 'react';
import { Icon } from '../../atoms/Icon/Icon';
import './TabBar.css';

export interface TabBarItem { icon: string; label: string }

/**
 * Main mobile navigation. The selected destination is a primary pill; a dark copy of the icons rides inside it
 * so the icon under the pill reads dark. The host can move the pill with the swipe through pillRef/pillIconsRef.
 */
export function TabBar({ items, active, onSelect, floating, pillRef, pillIconsRef, label = 'Navegación principal' }: {
  items: TabBarItem[]; active: number; onSelect: (i: number) => void; floating?: boolean;
  pillRef?: React.Ref<HTMLSpanElement>; pillIconsRef?: React.Ref<HTMLSpanElement>; label?: string;
}) {
  const n = items.length;
  // without refs the pill sits on the active item
  const pillStyle = pillRef ? { width: `${100 / n}%` } : { width: `${100 / n}%`, transform: `translateX(${active * 100}%)` };
  const iconsStyle = pillIconsRef ? { width: `${n * 100}%` } : { width: `${n * 100}%`, transform: `translateX(${(-active * 100) / n}%)` };
  return (
    <nav className={['ds-tabbar', floating && 'ds-tabbar--floating'].filter(Boolean).join(' ')} aria-label={label}>
      {items.map((it, i) => (
        <button key={it.label} type="button" className={i === active ? 'ds-tabbar__item is-on' : 'ds-tabbar__item'} aria-label={it.label} aria-current={i === active ? 'page' : undefined} onClick={() => onSelect(i)}>
          <Icon name={it.icon} size={24} />
        </button>
      ))}
      <span className="ds-tabbar__track" aria-hidden="true">
        <span ref={pillRef} className="ds-tabbar__pill" style={pillStyle}>
          <span ref={pillIconsRef} className="ds-tabbar__pill-icons" style={iconsStyle}>
            {items.map((it) => <span key={it.label}><Icon name={it.icon} size={24} /></span>)}
          </span>
        </span>
      </span>
    </nav>
  );
}
