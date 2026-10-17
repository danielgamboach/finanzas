import type { Account } from './types';

/** Limited palette for account cards: picked to sit well on the dark background. */
export const ACCOUNT_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  graphite: { bg: '#404040', fg: '#FAFAFA', label: 'Grafito' },
  emerald: { bg: '#00D492', fg: '#06281D', label: 'Esmeralda' },
  cyan: { bg: '#00D3F2', fg: '#05272D', label: 'Cian' },
  yellow: { bg: '#FFDF20', fg: '#2A2405', label: 'Amarillo' },
  violet: { bg: '#C4B5FD', fg: '#1E1640', label: 'Violeta' },
  coral: { bg: '#FF8A7A', fg: '#3A100B', label: 'Coral' },
  blue: { bg: '#7CB4FF', fg: '#0B1E3A', label: 'Azul' },
  sand: { bg: '#E7DCC8', fg: '#2B2418', label: 'Arena' },
};
export const accountColor = (a: Pick<Account, 'color'> | null | undefined) => ACCOUNT_COLORS[a?.color || 'graphite'] || ACCOUNT_COLORS.graphite;

export const BRANDS: Record<string, string> = { amex: 'Amex', visa: 'Visa', mastercard: 'Mastercard' };

/** Order used everywhere accounts are listed: cards first, then the rest. */
export const KIND_ORDER = ['credit_card', 'debit', 'savings', 'cash', 'cdp', 'other', 'investment', 'loan'];
export const byKind = (a: Account, b: Account) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name);
