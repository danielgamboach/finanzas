export type Currency = 'CRC' | 'USD';
export type TxKind = 'expense' | 'income' | 'transfer' | 'contribution' | 'refund';

export interface Profile {
  id: string;
  name: string | null;
  emoji: string | null;
}

export interface Space {
  id: string;
  name: string;
  emoji: string;
  kind: 'personal' | 'shared';
  week_start: number;
  created_by: string | null;
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
  contributor_id: string | null;
  recurring_id: string | null;
  status: 'posted' | 'review';
  source: 'manual' | 'email' | 'import' | 'recurring' | 'system';
  external_id: string | null;
  category_source?: 'auto' | 'ai' | 'manual' | null;
  suggested_category_id?: string | null;
  ai_confidence?: number | null;
  ai_checked_at?: string | null;
  transaction_tags?: { tags: { name: string } | null }[];
}

export type Frequency = 'weekly' | 'biweekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'yearly';
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
  next_due: string; // YYYY-MM-DD
  method: PayMethod;
  match_pattern: string | null;
  last_paid_on: string | null;
  notes: string | null;
  active: boolean;
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
}

export interface Tag {
  id: string;
  space_id: string;
  name: string;
}
