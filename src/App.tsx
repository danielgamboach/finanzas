import { AppProvider, useApp, useRoute } from './store';
import { Loading, Toast } from './ui';
import { Ajustes } from './screens/Ajustes';
import { CategoryEdit, CategoryView } from './screens/CategoryEdit';
import { Home } from './screens/Home';
import { Login } from './screens/Login';
import { Movimientos } from './screens/Movimientos';
import { AccountEdit, GoalEdit, Patrimonio, Saldos } from './screens/Patrimonio';
import { Presupuesto } from './screens/Presupuesto';
import { RecurringEdit, Recurrentes } from './screens/Recurrentes';
import { TxForm } from './screens/TxForm';

function Router() {
  const { session, ready, spaces } = useApp();
  const path = useRoute();
  if (!session) return <Login />;
  if (!ready) return <Loading />;
  if (spaces.length === 0) return <Loading />;

  const [, a, b, c] = path.split('/');
  switch (a) {
    case '':
    case undefined:
      return <Home />;
    case 'movimientos':
      return <Movimientos />;
    case 'agregar':
      return <TxForm key="new" />;
    case 'mov':
      return <TxForm key={b} id={b} />;
    case 'presupuesto':
      return <Presupuesto />;
    case 'categoria':
      return b === 'nueva' || c === 'editar' ? <CategoryEdit key={b} id={b} /> : <CategoryView key={b} id={b} />;
    case 'recurrentes':
      return <Recurrentes />;
    case 'recurrente':
      return <RecurringEdit key={b} id={b} />;
    case 'cuentas':
    case 'patrimonio':
      return <Patrimonio />;
    case 'saldos':
      return <Saldos />;
    case 'cuenta':
      return <AccountEdit key={b} id={b} />;
    case 'meta':
      return <GoalEdit key={b} id={b} />;
    case 'ajustes':
      return <Ajustes />;
    default:
      return <Home />;
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
