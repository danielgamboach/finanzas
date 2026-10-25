import { useEffect, useRef } from 'react';
import { AppProvider, go, useApp, useRoute } from './store';
import { Loading, Toast } from './ui';
import { Ajustes } from './screens/Ajustes';
import { CategoryEdit, CategoryView } from './screens/CategoryEdit';
import { Login } from './screens/Login';
import { AccountEdit, AccountView, GoalEdit, Saldos } from './screens/Patrimonio';
import { Shell } from './screens/Shell';
import { RecurringEdit, Recurrentes } from './screens/Recurrentes';
import { TxForm } from './screens/TxForm';
import { NotifPrompt } from './screens/NotifPrompt';
import { Onboarding, pendingInvite, setPendingInvite } from './screens/Onboarding';
import { db } from './lib/api';
import { Analisis } from './screens/Presupuesto';
import { Cuentas } from './screens/Patrimonio';
import { DesktopHome, DesktopLayout, DesktopMovements } from './desktop/Desktop';
import { useDesktop } from './lib/useDesktop';
import { KaiHost } from './ui/Kai';
import { TxDetail } from './ui/TxDetail';

const MODAL = new Set(['agregar', 'mov']);

/** #/unirme/<code>: keep the invite until the person is in, then join (new people do it in the setup). */
function useInviteLink(path: string) {
  const { session, ready, profile, reloadMeta, setSpaceId, toast } = useApp();
  const m = path.match(/^\/unirme\/([a-z0-9]+)/i);
  // saved right away so the first screen (sign-up or the setup) already knows about it
  if (m && pendingInvite() !== m[1].toLowerCase()) setPendingInvite(m[1].toLowerCase());
  useEffect(() => {
    if (!m) return;
    history.replaceState(null, '', '#/');
    dispatchEvent(new HashChangeEvent('hashchange'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.[1]]);
  useEffect(() => {
    const code = pendingInvite();
    if (!session || !ready || !profile?.onboarded_at || !code) return;
    setPendingInvite(null);
    db.rpc<string>('accept_invite', { p_code: code })
      .then(async (sid) => {
        await reloadMeta();
        setSpaceId(sid);
        toast('🎉 Te uniste al espacio compartido');
      })
      .catch(() => toast('Esa invitación ya no sirve. Pedí un enlace nuevo.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, ready, profile?.onboarded_at, path]);
}

function Router() {
  const { session, ready, spaces, profile, isAdmin } = useApp();
  const path = useRoute();
  useInviteLink(path);
  const desk = useDesktop();
  const bg = useRef('/');
  const [, a, b, c] = path.split('/');
  const modal = MODAL.has(a || '');
  // /mov/:id is the read-only detail (drawer or side sheet over the page); /mov/:id/editar is the form
  const detail = a === 'mov' && !!b && c !== 'editar';
  if (!modal) bg.current = path;
  if (!session) return <Login />;
  if (!ready) return <Loading />;
  if (spaces.length === 0) return <Loading />;
  // first time in: a short setup before anything else
  if (profile && !profile.onboarded_at) return <Onboarding />;
  if (a === 'bienvenida' && isAdmin) return <Onboarding preview key={path} />;

  if (desk) {
    // desktop: the page stays put and the movement form opens on top of it
    const [, ba, bb, bc] = bg.current.split('/');
    return (
      <>
        <DesktopLayout route={ba || ''}>
          <DesktopScreen a={ba} b={bb} c={bc} />
        </DesktopLayout>
        {modal && !detail && <DesktopModal>{a === 'agregar' ? <TxForm key="new" /> : <TxForm key={b} id={b} />}</DesktopModal>}
        {detail && <TxDetail id={b!} />}
        <NotifPrompt />
      </>
    );
  }

  if (detail) {
    // the page underneath stays mounted (same position in the tree), the detail slides over it
    const [, ba, bb, bc] = bg.current.split('/');
    return (
      <>
        <Screen a={ba} b={bb} c={bc} />
        <TxDetail id={b!} />
        <NotifPrompt />
      </>
    );
  }

  return (
    <>
      <Screen a={a} b={b} c={c} />
      <NotifPrompt />
    </>
  );
}

function DesktopScreen({ a, b, c }: { a?: string; b?: string; c?: string }) {
  switch (a) {
    case '':
    case undefined:
      return <DesktopHome />;
    case 'movimientos':
      return <DesktopMovements />;
    case 'analisis':
    case 'presupuesto':
      return <Analisis />;
    case 'cuentas':
    case 'patrimonio':
      return <Cuentas />;
    default:
      return <Screen a={a} b={b} c={c} />;
  }
}

/** Centered dialog over the current page; Esc or a click outside closes it. */
function DesktopModal({ children }: { children: React.ReactNode }) {
  const close = () => (history.length > 1 ? history.back() : go('/'));
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.sheet-backdrop') && closeRef.current();
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, []);
  return (
    <div className="desk-modal" onMouseDown={(e) => (e.target as HTMLElement).classList.contains('form-screen') && close()}>
      {children}
    </div>
  );
}

function Screen({ a, b, c }: { a?: string; b?: string; c?: string }) {
  switch (a) {
    case '':
    case undefined:
    case 'movimientos':
    case 'analisis':
    case 'presupuesto':
    case 'cuentas':
    case 'patrimonio':
      return <Shell route={a || ''} />;
    case 'agregar':
      return <TxForm key="new" />;
    case 'mov':
      return <TxForm key={b} id={b} />;
    case 'categoria':
      return b === 'nueva' || c === 'editar' ? <CategoryEdit key={b} id={b} /> : <CategoryView key={b} id={b} />;
    case 'recurrentes':
      return <Recurrentes />;
    case 'recurrente':
      return <RecurringEdit key={b} id={b} />;
    case 'saldos':
      return <Saldos />;
    case 'cuenta':
      return b === 'nueva' || c === 'editar' ? <AccountEdit key={b} id={b} /> : <AccountView key={b} id={b} />;
    case 'meta':
      return <GoalEdit key={b} id={b} />;
    case 'ajustes':
      return <Ajustes />;
    default:
      return <Shell route="" />;
  }
}

export function App() {
  return (
    <AppProvider>
      <Router />
      <KaiHost />
      <Toast />
    </AppProvider>
  );
}
