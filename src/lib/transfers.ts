import type { Account, Profile, Space, Tx } from './types';

/**
 * Moving money doesn't take a category from the space: it gets a fixed one from where the money goes (MOV-04).
 * None of them counts in the budget.
 */
export function transferLabel(t: Pick<Tx, 'kind' | 'to_account_id' | 'to_space_id'>, accounts: Pick<Account, 'id' | 'kind'>[]) {
  const to = accounts.find((a) => a.id === t.to_account_id);
  if (to?.kind === 'credit_card') return 'Pago de tarjeta';
  if (to?.kind === 'loan') return 'Abono a préstamo';
  if (to && (to.kind === 'savings' || to.kind === 'cdp' || to.kind === 'investment')) return 'Ahorro';
  if (t.to_space_id) return 'A un espacio compartido';
  return 'Movimiento entre cuentas';
}

/** A transfer that came into this space from another one (someone's personal account). */
export const isIncoming = (t: Pick<Tx, 'kind' | 'space_id' | 'to_space_id'>, spaceId: string | null | undefined) =>
  t.kind === 'transfer' && !!spaceId && t.space_id !== spaceId && t.to_space_id === spaceId;

/** Who sent an incoming transfer: "Dani (cuenta personal)". The other space's account stays private. */
export function incomingFrom(t: Pick<Tx, 'created_by' | 'contributor_id' | 'space_id'>, profiles: Record<string, Profile>, spaces: Space[]) {
  const who = profiles[t.contributor_id || t.created_by || '']?.name;
  const from = spaces.find((s) => s.id === t.space_id);
  if (who) return `${who} (cuenta ${from?.kind === 'personal' ? 'personal' : 'de otro espacio'})`;
  return from ? `Otro espacio: ${from.name}` : 'Otro espacio';
}

/** Which kinds of account can do what (CTA-12). */
export const canPay = (a: Pick<Account, 'kind'>) => !['cdp', 'investment', 'loan'].includes(a.kind);
export const canReceiveIncome = (a: Pick<Account, 'kind'>) => !['credit_card', 'loan'].includes(a.kind);
export const canSendMoney = (a: Pick<Account, 'kind'>) => !['credit_card', 'loan'].includes(a.kind);

/** Whether an account shows a balance: everything but cards, and the cash only when it keeps one (CTA-14). */
export const keepsBalance = (a: Pick<Account, 'kind' | 'track_balance'>) => a.kind !== 'credit_card' && a.track_balance !== false;
