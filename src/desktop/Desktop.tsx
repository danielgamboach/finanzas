import { useEffect, useRef, useState } from 'react';
import { needsConfirm, useRecurring } from '../lib/recurring';
import { accountColor } from '../lib/accounts';
import { money } from '../lib/format';
import { go, useApp } from '../store';
import { Icon, tint } from '../ui';
import { photoFor } from '../lib/photos';
import { MerchantFace, useHomeSummary } from '../screens/Home';
import { MovementsBrowser } from '../screens/Movimientos';

const NAV = [
  { k: '', label: 'Inicio', icon: 'house', match: ['', 'movimientos'] },
  { k: 'analisis', label: 'Análisis', icon: 'chart', match: ['analisis', 'presupuesto', 'categoria'] },
  { k: 'cuentas', label: 'Cuentas', icon: 'cards', match: ['cuentas', 'patrimonio', 'cuenta', 'saldos', 'meta'] },
  { k: 'movimientos', label: 'Movimientos', icon: 'list', match: [] as string[] },
];

/** Desktop frame: a fixed sidebar and a scrolling content area. No swipes, sheets or floating bars. */
export function DesktopLayout({ route, children }: { route: string; children: React.ReactNode }) {
  const { space, cur, toggleCur } = useApp();
  const main = useRef<HTMLElement>(null);
  const { items } = useRecurring(space?.id);
  const pending = items.filter(needsConfirm).length;

  // a new page starts at the top
  useEffect(() => {
    main.current?.scrollTo({ top: 0 });
  }, [route]);

  // keyboard: N for a new movement, / to search movements
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        go('/agregar');
      } else if (e.key === '/') {
        e.preventDefault();
        if (route !== 'movimientos') go('/movimientos');
        setTimeout(() => document.querySelector<HTMLInputElement>('.dmain .search input')?.focus(), 60);
      }
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [route]);

  const isOn = (n: (typeof NAV)[number]) => (n.k === 'movimientos' ? route === 'movimientos' : n.match.includes(route) && !(n.k === '' && route === 'movimientos'));

  return (
    <div className="desk">
      <aside className="dside" aria-label="Navegación">
        <div className="dbrand"><span className="dbrand-mark" aria-hidden="true">₡</span>Finanzas</div>
        <SpaceSwitch />
        <a href="#/agregar" className="dnew"><Icon name="plus" size={18} stroke={2.4} />Nuevo movimiento<kbd>N</kbd></a>
        <nav className="dnav">
          {NAV.map((n) => (
            <a key={n.label} href={`#/${n.k}`} className={isOn(n) ? 'dnav-item on' : 'dnav-item'} aria-current={isOn(n) ? 'page' : undefined}>
              <Icon name={n.icon} size={18} />
              {n.label}
            </a>
          ))}
          <span className="dnav-sep" />
          <a href="#/recurrentes" className={route === 'recurrentes' || route === 'recurrente' ? 'dnav-item on' : 'dnav-item'}>
            <Icon name="repeat" size={18} />
            Recurrentes
            {pending > 0 && <span className="count-badge">{pending}</span>}
          </a>
          <a href="#/ajustes" className={route === 'ajustes' ? 'dnav-item on' : 'dnav-item'}>
            <Icon name="gear" size={18} />
            Ajustes
          </a>
        </nav>
        <div className="dside-foot">
          <span className="muted small">Montos en</span>
          <div className="dcur" role="radiogroup" aria-label="Moneda">
            {(['CRC', 'USD'] as const).map((c) => (
              <button key={c} role="radio" aria-checked={cur === c} className={cur === c ? 'on' : ''} onClick={() => cur !== c && toggleCur()}>
                {c === 'CRC' ? '₡ Colones' : '$ Dólares'}
              </button>
            ))}
          </div>
        </div>
      </aside>
      <main ref={main} className="dmain">{children}</main>
    </div>
  );
}

/** Space picker as a popover menu. */
function SpaceSwitch() {
  const { profile, space, spaces, setSpaceId, bump } = useApp();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    addEventListener('mousedown', close);
    addEventListener('keydown', close);
    return () => {
      removeEventListener('mousedown', close);
      removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div className="dspace" ref={box}>
      <button className="dspace-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="profile-avatar" aria-hidden="true">{profile?.emoji || (profile?.name || 'U').charAt(0)}</span>
        <span className="col grow dspace-names">
          <strong>{profile?.name || 'Perfil'}</strong>
          <span className="muted small">{space?.emoji} {space?.name}</span>
        </span>
        <Icon name="chevDown" size={16} />
      </button>
      {open && (
        <div className="dmenu" role="menu">
          <span className="dmenu-label">Espacio</span>
          {spaces.map((s) => (
            <button
              key={s.id}
              role="menuitemradio"
              aria-checked={s.id === space?.id}
              className={s.id === space?.id ? 'dmenu-item on' : 'dmenu-item'}
              onClick={() => {
                setSpaceId(s.id);
                bump();
                setOpen(false);
              }}
            >
              <span aria-hidden="true">{s.emoji}</span>
              <span className="grow">{s.name}</span>
              <span className="muted small">{s.kind === 'shared' ? 'Compartido' : 'Solo vos'}</span>
              {s.id === space?.id && <Icon name="check" size={16} stroke={2.6} />}
            </button>
          ))}
          <span className="dmenu-sep" />
          <button className="dmenu-item" onClick={() => { setOpen(false); go('/ajustes'); }}>
            <Icon name="gear" size={16} />
            <span className="grow">Espacios y ajustes</span>
          </button>
        </div>
      )}
    </div>
  );
}

/** Desktop home: the month in three cards, then the latest movements as a table. */
export function DesktopHome() {
  const { cur, fx, photos, categories } = useApp();
  const h = useHomeSummary();
  if (!h) return null;
  const { label, value, negative, delta, vsLabel, cardLabel, cardValue, cardSub, spent, budget, merchants, peek } = h;
  const used = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  const faces = merchants.slice(0, 8);
  const more = merchants.length - faces.length;
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Costa_Rica' }).format(new Date()));
  const hello = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <div className="dpage">
      <header className="dpage-head">
        <div className="col">
          <span className="muted">{hello}</span>
          <h1 className="dtitle">Inicio</h1>
        </div>
      </header>

      <div className="dhome-top">
        <section className="dcard dhero" aria-label="Resumen del mes">
          <span className="balance-label">{label}</span>
          <div className="balance-row">
            <span className={negative ? 'dhero-num neg' : 'dhero-num'}>{negative ? '−' : ''}{money(value, cur, fx)}</span>
            {delta && <span className={delta.good ? 'balance-delta good' : 'balance-delta bad'}>{delta.text}</span>}
          </div>
          {delta && <span className="balance-vs">{vsLabel}</span>}
          <div className="balance-actions">
            <a href="#/agregar" className="pill-btn light"><Icon name="plusCircle" size={16} />Nuevo gasto</a>
            <a href="#/analisis" className="pill-btn"><Icon name="chart" size={16} />Ver análisis</a>
          </div>
        </section>

        <a className="dcard dspend" href="#/analisis" aria-label={`${cardLabel}: ${money(cardValue, cur, fx)}`}>
          <span className="spend-label">{cardLabel}</span>
          <span className="dspend-value">{money(cardValue, cur, fx)}{cardSub && <span className="spend-sub"> {cardSub}</span>}</span>
          {budget > 0 && (
            <span className="bar"><span className="bar-fill" style={{ width: `${used}%`, background: used >= 100 ? 'var(--danger)' : used >= 80 ? 'var(--warn)' : 'var(--ink)' }} /></span>
          )}
          {faces.length > 0 && (
            <span className="dfaces" aria-label="Comercios recientes">
              {faces.map((m) => (
                <span key={m.key} className="dface" title={m.tx.merchant || ''} style={{ background: photoFor(photos, m.tx.merchant, m.tx.raw_merchant) ? '#fff' : tint(categories.find((c) => c.id === m.tx.category_id)?.color) }}>
                  <MerchantFace tx={m.tx} size={30} />
                </span>
              ))}
              {more > 0 && <span className="dface more">+{more > 99 ? 99 : more}</span>}
            </span>
          )}
        </a>

        <a className="dcard dwallet" href="#/cuentas" aria-label="Ver cuentas">
          <span className="row between"><span className="spend-label">Cuentas</span><Icon name="arrowRight" size={16} /></span>
          <span className="dwallet-fan" aria-hidden="true">
            {peek.map((a, i) => (
              <span key={a.id} className="dwallet-card" style={{ background: accountColor(a).bg, color: accountColor(a).fg, zIndex: i, '--i': i } as React.CSSProperties}>
                <span>{a.name}</span>
                <span className="wc-num">{a.last4 ? `••••${a.last4}` : ''}</span>
              </span>
            ))}
          </span>
        </a>
      </div>

      <section className="dcard dmov">
        <div className="row between dmov-head">
          <h2 className="h2">Movimientos</h2>
          <a className="link" href="#/movimientos">Ver todos <kbd>/</kbd></a>
        </div>
        <MovementsBrowser table limit={25} screen="home-desk" />
      </section>
    </div>
  );
}

/** Desktop movements page: the full table with filters. */
export function DesktopMovements() {
  return (
    <div className="dpage">
      <header className="dpage-head">
        <h1 className="dtitle">Movimientos</h1>
        <a href="#/agregar" className="pill-btn light"><Icon name="plus" size={16} stroke={2.4} />Nuevo movimiento</a>
      </header>
      <section className="dcard dmov">
        <MovementsBrowser table screen="mov" autoFocus={false} />
      </section>
    </div>
  );
}
