import type { Category } from './types';

/** Helpers for one level of subcategories: a category may have a parent; budgets live on the parent. */

export const isSub = (c: Category) => !!c.parent_id;

export const topLevel = (cats: Category[]) => cats.filter((c) => !c.parent_id);

export const childrenOf = (cats: Category[], id: string) => cats.filter((c) => c.parent_id === id && !c.archived).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));

/** The id a spend rolls up to (its parent, or itself). */
export function rootId(cats: Category[], id: string | null | undefined) {
  if (!id) return null;
  const c = cats.find((x) => x.id === id);
  return c?.parent_id || id;
}

/** Ids that belong to this category: itself plus its subcategories. */
export function familyIds(cats: Category[], id: string) {
  return new Set([id, ...cats.filter((c) => c.parent_id === id).map((c) => c.id)]);
}

export function parentOf(cats: Category[], c: Category | null | undefined) {
  return c?.parent_id ? cats.find((x) => x.id === c.parent_id) || null : null;
}

/** "Salidas › Bares" for a subcategory, plain name otherwise. */
export function catLabel(cats: Category[], c: Category | null | undefined) {
  if (!c) return '';
  const p = parentOf(cats, c);
  return p ? `${p.name} › ${c.name}` : c.name;
}

/** Parents in their order, each followed by its subcategories (for pickers). */
export function pickerOrder(cats: Category[]) {
  const out: Category[] = [];
  const tops = cats.filter((c) => !c.parent_id || !cats.some((p) => p.id === c.parent_id));
  for (const t of tops.sort((a, b) => a.sort - b.sort)) {
    out.push(t);
    out.push(...cats.filter((c) => c.parent_id === t.id).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)));
  }
  return out;
}
