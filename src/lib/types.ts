export type Currency = 'CRC' | 'USD';
export type TxKind = 'expense' | 'income' | 'transfer' | 'contribution' | 'refund';

export interface Profile {
  id: string;
  name: string | null;
  emoji: string | null;
  notify_limits?: boolean;
  notify_card?: boolean;
  /** Set when the first-time setup was finished or skipped; null means it still has to show. */
  onboarded_at?: string | null;
  /** The "Primeros pasos" checklist on Inicio was closed. */
  setup_hidden?: boolean;
}

export interface Space {
  id: string;
  name: string;
  emoji: string;
  kind: 'personal' | 'shared';
  week_start: number;
  created_by: string | null;
  /** Pays the cards' charges of the previous week every week (the "Pago de tarjeta" reminder). */
  card_weekly?: boolean;
}

export interface Member {
  space_id: string;
  user_id: string;
  role: 'owner' | 'member';
}

export interface Category {
  id: string;
  space_id: string;
  name: string;
  emoji: string;
  color: string;
  kind: 'expense' | 'income';
  limit_amount: number | null;
  limit_period: 'weekly' | 'monthly' | null;
  is_fixed: boolean;
  archived: boolean;
  sort: number;
  parent_id?: string | null;
}

export type AccountKind = 'credit_card' | 'debit' | 'savings' | 'investment' | 'cash' | 'cdp' | 'loan' | 'other';

export interface Account {
  id: string;
  space_id: string;
  name: string;
  institution: string | null;
  kind: AccountKind;
  currency: Currency;
  last4: string | null;
  emoji: string;
  archived: boolean;
  color?: string | null;
  brand?: 'amex' | 'visa' | 'mastercard' | null;
  /** False: movements are recorded but the account shows no balance (the cash account by default). */
  track_balance?: boolean;
  /** 'cash': the space's Efectivo, which always exists and can't be deleted or archived. */
  system?: 'cash' | null;
}

export interface Tx {
  id: string;
  space_id: string;
  kind: TxKind;
  amount: number;
  currency: Currency;
  fx_rate: number;
  amount_crc: number;
  occurred_at: string;
  merchant: string | null;
  raw_merchant: string | null;
  note: string | null;
  category_id: string | null;
  account_id: string | null;
  to_account_id: string | null;
  /** The space of the destination when a transfer goes to another space (it shows in both). */
  to_space_id?: string | null;
  contributor_id: string | null;
  recurring_id: string | null;
  status: 'posted' | 'review';
  source: 'manual' | 'email' | 'import' | 'recurring' | 'system';
  external_id: string | null;
  /** Card authorization (Uber, Didi): 'pending' until it settles, 'void' if it was never charged. */
  hold?: 'pending' | 'void' | null;
  hold_resolved_at?: string | null;
  /** A digital charge waiting for "¿Es una suscripción?" ('pending'), or already answered ('done'). */
  sub_ask?: 'pending' | 'done' | null;
  category_source?: 'auto' | 'ai' | 'manual' | null;
  suggested_category_id?: string | null;
  ai_confidence?: number | null;
  ai_checked_at?: string | null;
  merchant_key?: string | null;
  /** Catalog merchant (set by the database from the names). */
  merchant_id?: string | null;
  /** A catalog merchant the AI thinks this is; the person confirms it. */
  suggested_merchant_id?: string | null;
  created_by?: string | null;
  created_at?: string;
  /** 'no_voucher': an automatic charge registered with the expected amount because the bank's voucher didn't arrive. */
  auto_flag?: 'no_voucher' | null;
  transaction_tags?: { tags: { name: string } | null }[];
}

export type Frequency = 'weekly' | 'biweekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'yearly' | 'custom';
export type EveryUnit = 'day' | 'week' | 'month';
export type PayMethod = 'card' | 'transfer' | 'cash';

export interface Recurring {
  id: string;
  space_id: string;
  kind: TxKind;
  amount: number;
  currency: Currency;
  category_id: string | null;
  account_id: string | null;
  merchant: string;
  frequency: Frequency;
  /** frequency 'custom': every N days, weeks or months. */
  every_n?: number | null;
  every_unit?: EveryUnit | null;
  next_due: string; // YYYY-MM-DD
  /** Postponed: this payment shows again from this day. */
  snooze_until?: string | null;
  /** Charged on its own (card, direct debit); false means the person pays it by hand. */
  auto?: boolean;
  /** Where the money goes, for a recurring transfer. */
  to_account_id?: string | null;
  method: PayMethod;
  match_pattern: string | null;
  last_paid_on: string | null;
  notes: string | null;
  active: boolean;
  /** Electricity, water, internet: matched whatever the amount; amount is the average of the last 3 payments. */
  variable?: boolean;
}

export interface RecurringSuggestion {
  merchant_key: string;
  merchant: string | null;
  raw_merchant: string | null;
  currency: Currency;
  amount: number;
  months: number;
  last_date: string;
  next_guess: string;
  category_id: string | null;
  account_id: string | null;
}

export interface Goal {
  id: string;
  space_id: string;
  name: string;
  emoji: string;
  color: string;
  target_amount: number;
  currency: Currency;
  goal_accounts?: { account_id: string }[];
}

export interface Snapshot {
  id: string;
  account_id: string;
  balance: number;
  taken_on: string;
  /** When it was typed in: movements after this moment move the balance. */
  created_at?: string;
}

export interface Tag {
  id: string;
  space_id: string;
  name: string;
}
