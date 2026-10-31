-- Presupuesto como plan del mes (PRS): ingreso, ahorro apartado al inicio y lo que sobra de un límite al cerrar el mes.
-- Los fijos y variables salen de recurring; los límites siguen en categories.limit_amount.

-- One row per space and month: the income typed by hand (null = from the recurring incomes) and the month's close.
create table if not exists public.budget_months (
  space_id uuid not null references public.spaces on delete cascade,
  month date not null check (extract(day from month) = 1),
  income numeric(16,2) check (income >= 0),
  closed_at timestamptz,
  carried boolean,
  primary key (space_id, month)
);
alter table public.budget_months enable row level security;
create policy budget_months_all on public.budget_months for all to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));

-- Money set apart every month, before anything else (emergencias, inversión…). Optional link to a goal.
create table if not exists public.budget_savings (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces on delete cascade,
  name text not null check (length(trim(name)) > 0),
  amount numeric(16,2) not null check (amount > 0),
  currency text not null default 'CRC' check (currency in ('CRC','USD')),
  goal_id uuid references public.goals on delete set null,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.budget_savings enable row level security;
create policy budget_savings_all on public.budget_savings for all to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));

-- "Ya lo aparté": a saving marked by hand for a month (when no goal account shows the money moving).
create table if not exists public.budget_saving_marks (
  saving_id uuid not null references public.budget_savings on delete cascade,
  month date not null check (extract(day from month) = 1),
  created_at timestamptz not null default now(),
  primary key (saving_id, month)
);
alter table public.budget_saving_marks enable row level security;
create policy budget_saving_marks_all on public.budget_saving_marks for all to authenticated
  using (exists (select 1 from public.budget_savings s where s.id = saving_id and public.is_space_member(s.space_id)))
  with check (exists (select 1 from public.budget_savings s where s.id = saving_id and public.is_space_member(s.space_id)));

-- What was left in a limit and carried into the next month (adds to that month's limit).
create table if not exists public.budget_carry (
  space_id uuid not null references public.spaces on delete cascade,
  month date not null check (extract(day from month) = 1),
  category_id uuid not null references public.categories on delete cascade,
  amount numeric(16,2) not null check (amount > 0),
  primary key (space_id, month, category_id)
);
alter table public.budget_carry enable row level security;
create policy budget_carry_all on public.budget_carry for all to authenticated
  using (public.is_space_member(space_id))
  with check (public.is_space_member(space_id) and exists (select 1 from public.categories c where c.id = category_id and c.space_id = budget_carry.space_id));
