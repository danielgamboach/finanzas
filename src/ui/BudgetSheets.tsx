import { useState } from 'react';
import { ActionBar, Button } from '../ds';
import { db } from '../lib/api';
import type { Plan, Saving } from '../lib/budget';
import { amount, parseAmount, unitOf } from '../lib/format';
import type { Currency, Goal } from '../lib/types';
import { useApp } from '../store';
import { Sheet } from '.';

const typed = (n: number) => {
  const [i, d] = n.toFixed(2).split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d !== '00' ? `,${d}` : '');
};
const clean = (v: string) => v.replace(/[^0-9.,]/g, '');

/** The month's income (PRS-01): typed by hand, or back to what the recurring incomes expect. */
export function IncomeSheet({ plan, spaceId, monthLabel, onClose }: { plan: Plan; spaceId: string; monthLabel: string; onClose: () => void }) {
  const { cur, fx, toast, bump } = useApp();
  // typed in the display currency, stored in colones
  const toCur = (crc: number) => (cur === 'USD' ? crc / fx : crc);
  const [val, setVal] = useState(plan.income > 0 ? typed(Math.round(toCur(plan.income) * 100) / 100) : '');
  const [busy, setBusy] = useState(false);
  const num = parseAmount(val);

  async function save(income: number | null) {
    setBusy(true);
    try {
      await db.upsert('budget_months', { space_id: spaceId, month: plan.monthKey, income }, 'space_id,month');
      toast(income === null ? 'Ingreso según tus recurrentes' : `Ingreso de ${monthLabel} guardado`);
      bump();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={`Ingreso de ${monthLabel}`} onClose={onClose}>
      <p className="page-text">
        Lo que entra este mes. Del ingreso salen primero el ahorro y los pagos fijos; lo que queda se reparte en límites.
      </p>
      <div className="field-card">
        <label className="field-row">
          <span>Monto ({unitOf(cur)})</span>
          <input inputMode="decimal" value={val} onChange={(e) => setVal(clean(e.target.value))} aria-label="Ingreso del mes" autoFocus />
        </label>
      </div>
      {plan.incomeRecurring > 0 && plan.incomeSource === 'manual' && (
        <div className="page-actions">
          <Button variant="ghost" size="sm" onClick={() => save(null)} disabled={busy}>
            Usar mis ingresos recurrentes ({amount(plan.incomeRecurring, cur, fx)} {unitOf(cur)})
          </Button>
        </div>
      )}
      {plan.incomeRecurring === 0 && <p className="page-text muted">Si agregás tu salario en Recurrentes como ingreso, el mes arranca con ese monto solo.</p>}
      <ActionBar>
        <Button variant="primary" size="lg" block disabled={busy || !(num >= 0) || val === ''} onClick={() => save(Math.round((cur === 'USD' ? num * fx : num) * 100) / 100)}>
          Guardar ingreso
        </Button>
      </ActionBar>
    </Sheet>
  );
}

/** A savings line (PRS-05): name, monthly amount and, optionally, the goal it feeds. */
export function SavingSheet({ saving, spaceId, goals, nextSort, onClose }: { saving: Saving | null; spaceId: string; goals: Goal[]; nextSort: number; onClose: () => void }) {
  const { cur, toast, bump } = useApp();
  const [name, setName] = useState(saving?.name || '');
  const [currency, setCurrency] = useState<Currency>(saving?.currency || cur);
  const [val, setVal] = useState(saving ? typed(Number(saving.amount)) : '');
  const [goalId, setGoalId] = useState(saving?.goal_id || '');
  const [busy, setBusy] = useState(false);
  const num = parseAmount(val);

  async function run(fn: () => Promise<unknown>, msg: string, undo?: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      toast(msg, undo);
      bump();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  }

  const pickGoal = (id: string) => {
    setGoalId(id);
    const g = goals.find((x) => x.id === id);
    if (g && !name.trim()) setName(g.name);
  };
  const row = { name: name.trim(), amount: Math.round(num * 100) / 100, currency, goal_id: goalId || null };
  const save = () => run(
    () => (saving ? db.update('budget_savings', { id: saving.id }, row) : db.insert('budget_savings', { ...row, space_id: spaceId, sort: nextSort })),
    saving ? 'Ahorro actualizado' : 'Ahorro agregado',
  );
  const remove = () => saving && run(
    () => db.update('budget_savings', { id: saving.id }, { active: false }),
    `${saving.name} ya no se aparta`,
    () => db.update('budget_savings', { id: saving.id }, { active: true }),
  );

  return (
    <Sheet title={saving ? 'Editar ahorro' : 'Nuevo ahorro'} onClose={onClose}>
      <p className="page-text">Se aparta al inicio de cada mes, antes de los demás gastos.</p>
      <div className="field-card">
        <label className="field-row">
          <span>Nombre</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Emergencias, inversión…" aria-label="Nombre" />
        </label>
        <label className="field-row">
          <span>Al mes</span>
          <input inputMode="decimal" value={val} onChange={(e) => setVal(clean(e.target.value))} aria-label="Monto al mes" />
        </label>
        <label className="field-row">
          <span>Moneda</span>
          <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} aria-label="Moneda">
            <option value="CRC">Colones</option>
            <option value="USD">Dólares</option>
          </select>
        </label>
        {goals.length > 0 && (
          <label className="field-row">
            <span>Meta</span>
            <select value={goalId} onChange={(e) => pickGoal(e.target.value)} aria-label="Meta">
              <option value="">Ninguna</option>
              {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
        )}
      </div>
      {goalId && <p className="page-text muted">Se marca como apartado cuando movés el dinero a una cuenta de la meta.</p>}
      {saving && (
        <div className="page-actions">
          <Button variant="ghost" className="danger" size="sm" onClick={remove} disabled={busy}>Dejar de apartar</Button>
        </div>
      )}
      <ActionBar>
        <Button variant="primary" size="lg" block disabled={busy || !row.name || !(num > 0)} onClick={save}>
          {saving ? 'Guardar cambios' : 'Agregar ahorro'}
        </Button>
      </ActionBar>
    </Sheet>
  );
}
