import type { Account } from './types';

/** Limited palette for account cards: picked to sit well on the dark background. */
export const ACCOUNT_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  graphite: { bg: 'var(--account-graphite)', fg: 'var(--account-graphite-foreground)', label: 'Grafito' },
  emerald: { bg: 'var(--account-emerald)', fg: 'var(--account-emerald-foreground)', label: 'Esmeralda' },
  cyan: { bg: 'var(--account-cyan)', fg: 'var(--account-cyan-foreground)', label: 'Cian' },
  yellow: { bg: 'var(--account-yellow)', fg: 'var(--account-yellow-foreground)', label: 'Amarillo' },
  violet: { bg: 'var(--account-violet)', fg: 'var(--account-violet-foreground)', label: 'Violeta' },
  coral: { bg: 'var(--account-coral)', fg: 'var(--account-coral-foreground)', label: 'Coral' },
  blue: { bg: 'var(--account-blue)', fg: 'var(--account-blue-foreground)', label: 'Azul' },
  sand: { bg: 'var(--account-sand)', fg: 'var(--account-sand-foreground)', label: 'Arena' },
};
export const accountColor = (a: Pick<Account, 'color'> | null | undefined) => ACCOUNT_COLORS[a?.color || 'graphite'] || ACCOUNT_COLORS.graphite;

export const BRANDS: Record<string, string> = { amex: 'Amex', visa: 'Visa', mastercard: 'Mastercard' };

/** Order used everywhere accounts are listed: cards first, then the rest. */
export const KIND_ORDER = ['credit_card', 'debit', 'savings', 'cash', 'cdp', 'other', 'investment', 'loan'];
export const byKind = (a: Account, b: Account) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name);
