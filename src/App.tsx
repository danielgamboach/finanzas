import { AppProvider, useApp, useRoute } from './store';
import { Loading, Toast } from './ui';
import { Ajustes } from './screens/Ajustes';
import { CategoryEdit, CategoryView } from './screens/CategoryEdit';
import { Login } from './screens/Login';
import { AccountEdit, AccountView, GoalEdit, Saldos } from './screens/Patrimonio';
import { Shell } from './screens/Shell';
import { RecurringEdit, Recurrentes } from './screens/Recurrentes';
import { TxForm } from './screens/TxForm';
import { NotifPrompt } from './screens/NotifPrompt';

function Router() {
  const { session, ready, spaces } = useApp();
  const path = useRoute();
  if (!session) return <Login />;
  if (!ready) return <Loading />;
  if (spaces.length === 0) return <Loading />;

  const [, a, b, c] = path.split('/');
  return (
    <>
      <Screen a={a} b={b} c={c} />
      <NotifPrompt />
    </>
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
      <Toast />
    </AppProvider>
  );
}
