import { useState } from 'react';
import { db } from '../lib/api';
import { pickerOrder } from '../lib/cats';
import type { Tx } from '../lib/types';
import { useApp } from '../store';
import { Icon } from '.';

/**
 * "Por revisar" as a category selector: pick one and the movement is categorized right there.
 * A native select, so phones show their own picker and it works with the keyboard.
 */
export function CatPick({ t }: { t: Tx }) {
  const { categories, toast, bump } = useApp();
  const [busy, setBusy] = useState(false);
  const kind = t.kind === 'income' || t.kind === 'contribution' ? 'income' : 'expense';
  const options = pickerOrder(categories.filter((c) => !c.archived && c.kind === kind));
  const suggested = t.suggested_category_id ? categories.find((c) => c.id === t.suggested_category_id) : null;

  async function pick(id: string) {
    if (!id) return;
    setBusy(true);
    try {
      await db.update('transactions', { id: t.id }, { category_id: id, status: 'posted', category_source: id === suggested?.id ? 'ai' : 'manual', suggested_category_id: null });
      const c = categories.find((x) => x.id === id);
      toast(`${c?.emoji || '✅'} ${t.merchant || 'Movimiento'} → ${c?.name || 'categorizado'}`);
      bump();
    } catch {
      toast('No se pudo guardar la categoría');
      setBusy(false);
    }
  }

  return (
    <label className="cat-pick" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <span className="sr">Categoría de {t.merchant || 'este movimiento'}</span>
      <span className="cat-pick-label" aria-hidden="true">{suggested ? `${suggested.emoji} ¿${suggested.name}?` : 'Elegir categoría'}</span>
      <Icon name="chevDown" size={14} stroke={2.4} />
      <select value="" disabled={busy} onChange={(e) => void pick(e.target.value)}>
        <option value="" disabled>Elegir categoría</option>
        {suggested && <option value={suggested.id}>✨ {suggested.emoji} {suggested.name} (sugerida)</option>}
        {options.map((c) => (
          <option key={c.id} value={c.id}>{c.parent_id ? '    ' : ''}{c.emoji} {c.name}</option>
        ))}
      </select>
    </label>
  );
}
