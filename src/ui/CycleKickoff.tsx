import { useState } from 'react';
import { ActionBar, Button, ListGroup, ListRow } from '../ds';
import { db } from '../lib/api';
import { cycleRange, todayKey } from '../lib/cycle';
import { useApp } from '../store';
import { Sheet } from './index';

/**
 * PRM-12: the budget month starts on payday. Shows since when the current month counts and
 * "Empezar mes", which starts a new one on the chosen day (today by default), with undo.
 */
export function CycleKickoff() {
  const { space, cycles, reloadMeta, bump, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(todayKey());
  const [busy, setBusy] = useState(false);
  if (!space) return null;
  void cycles;
  const c = cycleRange(0);
  const late = c.custom && c.day > 35;
  const detail = c.custom
    ? `Desde el ${c.startLabel} · día ${c.day}${late ? '. ¿Ya te pagaron?' : ''}`
    : 'Del 1 al fin de mes';

  const refresh = async () => {
    await reloadMeta();
    bump();
  };
  const save = async () => {
    if (!day || day > todayKey()) return;
    setBusy(true);
    try {
      await db.upsert('budget_cycles', { space_id: space.id, starts_on: day }, 'space_id,starts_on');
      // a later start that was already there would hide this one: the newest start is the month
      await refresh();
      setOpen(false);
      toast('Mes empezado', async () => {
        await db.remove('budget_cycles', { space_id: space.id, starts_on: day });
        await refresh();
      });
    } catch {
      toast('No se pudo empezar el mes');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ListGroup>
        <ListRow
          leading={<ListRow.Icon name="calendar" />}
          title={c.custom ? 'Este mes' : 'Mes calendario'}
          detail={detail}
          detailTone={late ? 'warning' : 'muted'}
          actions={<Button variant={late ? 'primary' : 'secondary'} size="xs" onClick={() => { setDay(todayKey()); setOpen(true); }}>Empezar mes</Button>}
        />
      </ListGroup>
      {open && (
        <Sheet title="Empezar mes" onClose={() => setOpen(false)}>
          <p className="muted">El presupuesto, Inicio y los filtros de "Este mes" cuentan desde este día hasta que empecés el siguiente. Elegí el día que te pagaron.</p>
          <div className="field-card">
            <label className="field-row">
              <span>Empieza el</span>
              <input type="date" value={day} max={todayKey()} onChange={(e) => setDay(e.target.value)} aria-label="Día en que empieza el mes" />
            </label>
          </div>
          <ActionBar>
            <Button variant="primary" size="lg" block disabled={busy || !day || day > todayKey()} onClick={save}>Empezar mes</Button>
          </ActionBar>
        </Sheet>
      )}
    </>
  );
}
