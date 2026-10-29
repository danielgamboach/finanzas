import { useEffect, useRef, useState } from 'react';
import { needsConfirm, useRecurring } from '../lib/recurring';
import { byKind } from '../lib/accounts';
import { go, useApp } from '../store';
import { Icon } from '../ui';
import { Badge, Button, GroupSkeleton, ListGroup, ListRow, Loader, Logo } from '../ds';
import { SpendOverview, useHomeSummary } from '../screens/Home';
import { MovementsBrowser } from '../screens/Movimientos';
import { AccountListRow, useNetWorth } from '../screens/Patrimonio';
import { openKai } from '../ui/Kai';
import { PendingPayments } from '../ui/PendingPayments';
import { GettingStarted } from '../ui/GettingStarted';
import { TxTableRow } from '../ui/TxRow';
import { greeting } from '../lib/greetings';

const NAV = [
  { k: '', label: 'Inicio', icon: 'house', match: [''] },
  { k: 'movimientos', label: 'Movimientos', icon: 'list', match: ['movimientos'] },
  { k: 'cuentas', label: 'Cuentas', icon: 'cards', match: ['cuentas', 'patrimonio', 'cuenta', 'saldos', 'meta'] },
  { k: 'categorias', label: 'Presupuesto', icon: 'pie', match: ['categorias', 'analisis', 'presupuesto', 'categoria'] },
  { k: 'tendencias', label: 'Mis finanzas', icon: 'chart', match: ['tendencias'] },
];

/** Desktop frame: a fixed sidebar and a scrolling content area. No swipes, sheets or floating bars. */
export function DesktopLayout({ route, children }: { route: string; children: React.ReactNode }) {
  const { space, cur, toggleCur, accounts } = useApp();
  const main = useRef<HTMLElement>(null);
  const { items } = useRecurring(space?.id);
  const pending = items.filter((r) => needsConfirm(r, accounts)).length;

  // a new page starts at the top
  useEffect(() => {
    main.current?.scrollTo({ top: 0 });
  }, [route]);

  // keyboard: N for a new movement, / to search movements, K to ask Kai
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest('input, textarea, select, [contenteditable]')) return;
      if (document.querySelector('.sheet-backdrop')) return;
      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        openKai();
      } else if (e.key === 'n' || e.key === 'N') {
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

  const isOn = (n: (typeof NAV)[number]) => (n.match as readonly string[]).includes(route);

  return (
    <div className="desk">
      <aside className="dside" aria-label="Navegación">
        <div className="dbrand"><Logo /></div>
        <SpaceSwitch />
        <Button variant="primary" size="md" className="dnew" href="#/agregar" leading={<Icon name="plus" size={18} />} trailing={<kbd>N</kbd>}>Nuevo movimiento</Button>
        <button className="dkai" onClick={() => openKai()}><Icon name="sparkle" size={18} />Preguntale a Kai<kbd>K</kbd></button>
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
            {pending > 0 && <Badge className="count-badge" count={pending} />}
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
                {c === 'CRC' ? '¢ Colones' : '$ Dólares'}
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

/** The accounts on the desktop home: the same rows as Cuentas, the first few. */
function DeskAccounts() {
  const { space } = useApp();
  const w = useNetWorth(space?.id || null);
  const accs = [...w.accounts].sort(byKind).slice(0, 5);
  if (w.loading && accs.length === 0) return <Loader><GroupSkeleton rows={4} leading="icon" /></Loader>;
  return (
    <ListGroup title="Cuentas" action={<a href="#/cuentas">Ver todas</a>}>
      {accs.length === 0 ? (
        <ListRow title="Agregá tus cuentas" chevron href="#/cuenta/nueva" />
      ) : accs.map((a) => <AccountListRow key={a.id} a={a} w={w} />)}
    </ListGroup>
  );
}

/** Desktop home: the spend summary with its chart, the accounts, what needs an answer, then the latest movements. */
export function DesktopHome() {
  const { profile } = useApp();
  const h = useHomeSummary();
  if (!h) return null;
  const { recent } = h;

  return (
    <div className="dpage">
      <header className="dpage-head">
        <h1 className="dtitle">{greeting(profile?.name) || 'Inicio'}</h1>
      </header>

      <div className="dhome-top">
        <section className="dhero" aria-label="Resumen">
          <SpendOverview h={h} />
        </section>
        <DeskAccounts />
      </div>

      <GettingStarted variant="card" />

      <PendingPayments variant="card" />

      <ListGroup title="Últimos movimientos" action={<a href="#/movimientos">Ver todos</a>}>
        <div className="ttable dmov-table" role="table" aria-label="Últimos movimientos">
          {recent.slice(0, 10).map((t) => <TxTableRow key={t.id} t={t} />)}
        </div>
      </ListGroup>
    </div>
  );
}

/** Desktop movements page: the full table with filters. */
export function DesktopMovements() {
  return (
    <div className="dpage">
      <header className="dpage-head">
        <h1 className="dtitle">Movimientos</h1>
      </header>
      <section className="dmov">
        <MovementsBrowser table screen="mov" autoFocus={false} />
      </section>
    </div>
  );
}
