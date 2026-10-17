create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text,
  emoji text default '🙂',
  created_at timestamptz not null default now()
);

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text not null default '👤',
  kind text not null check (kind in ('personal','shared')),
  week_start smallint not null default 5 check (week_start between 0 and 6),
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create table public.space_members (
  space_id uuid not null references public.spaces on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);
create index on public.space_members (user_id);

create table public.space_invites (
  code text primary key default encode(extensions.gen_random_bytes(6),'hex'),
  space_id uuid not null references public.spaces on delete cascade,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  used_by uuid references auth.users on delete set null,
  used_at timestamptz
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces on delete cascade,
  name text not null,
  institution text,
  kind text not null check (kind in ('credit_card','debit','savings','investment','cash','cdp','loan','other')),
  currency text not null default 'CRC' check (currency in ('CRC','USD')),
  last4 text check (last4 ~ '^[0-9]{4}$'),
  emoji text not null default '🏦',
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.accounts (space_id);
create index on public.accounts (last4) where last4 is not null;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces on delete cascade,
  name text not null,
  emoji text not null default '✨',
  color text not null default 'gray',
  kind text not null default 'expense' check (kind in ('expense','income')),
  limit_amount numeric(14,2) check (limit_amount is null or limit_amount >= 0),
  limit_period text check (limit_period in ('weekly','monthly')),
  is_fixed boolean not null default false,
  archived boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  unique (space_id, name)
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces on delete cascade,
  name text not null check (name ~ '^#'),
  unique (space_id, name)
);

create table public.recurring (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces on delete cascade,
  kind text not null default 'expense' check (kind in ('expense','income','transfer','contribution')),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'CRC' check (currency in ('CRC','USD')),
  category_id uuid references public.categories on delete set null,
  account_id uuid references public.accounts on delete set null,
  merchant text not null,
  day_of_month smallint not null check (day_of_month between 1 and 28),
  active boolean not null default true,
  last_generated date,
  created_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces on delete cascade,
  kind text not null check (kind in ('expense','income','transfer','contribution','refund')),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'CRC' check (currency in ('CRC','USD')),
  fx_rate numeric(10,4) not null default 1 check (fx_rate > 0),
  amount_crc numeric(16,2) generated always as (case when currency = 'USD' then round(amount * fx_rate, 2) else amount end) stored,
  occurred_at timestamptz not null default now(),
  merchant text,
  raw_merchant text,
  note text,
  category_id uuid references public.categories on delete set null,
  account_id uuid references public.accounts on delete set null,
  to_account_id uuid references public.accounts on delete set null,
  contributor_id uuid references auth.users on delete set null,
  recurring_id uuid references public.recurring on delete set null,
  status text not null default 'posted' check (status in ('posted','review')),
  source text not null default 'manual' check (source in ('manual','email','import','recurring','system')),
  external_id text,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index transactions_dedupe on public.transactions (space_id, source, external_id) where external_id is not null;
create index on public.transactions (space_id, occurred_at desc);
create index on public.transactions (category_id);

create table public.transaction_tags (
  transaction_id uuid not null references public.transactions on delete cascade,
  tag_id uuid not null references public.tags on delete cascade,
  primary key (transaction_id, tag_id)
);

create table public.merchant_rules (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces on delete cascade,
  pattern text not null,
  category_id uuid not null references public.categories on delete cascade,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  unique (space_id, pattern)
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces on delete cascade,
  name text not null,
  emoji text not null default '🎯',
  color text not null default 'butter',
  target_amount numeric(16,2) not null check (target_amount > 0),
  currency text not null default 'CRC' check (currency in ('CRC','USD')),
  created_at timestamptz not null default now()
);

create table public.goal_accounts (
  goal_id uuid not null references public.goals on delete cascade,
  account_id uuid not null references public.accounts on delete cascade,
  primary key (goal_id, account_id)
);

create table public.balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts on delete cascade,
  balance numeric(16,2) not null,
  taken_on date not null default current_date,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  unique (account_id, taken_on)
);

create table public.fx_rates (
  rate_date date primary key,
  crc_per_usd numeric(10,4) not null check (crc_per_usd > 0),
  source text not null default 'bccr'
);

create table public.ingest_tokens (
  token_hash text primary key,
  user_id uuid not null references auth.users on delete cascade,
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table public.ingest_unmatched (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  payload jsonb not null,
  reason text not null,
  created_at timestamptz not null default now()
);
