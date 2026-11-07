-- PPT-10: each space can start its budget month on the day it gets paid ("Empezar mes").
create table if not exists public.budget_cycles (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  starts_on date not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (space_id, starts_on)
);
alter table public.budget_cycles enable row level security;
create policy budget_cycles_all on public.budget_cycles for all
  using (is_space_member(space_id)) with check (is_space_member(space_id));
create index if not exists budget_cycles_space on public.budget_cycles (space_id, starts_on desc);

-- Simbiosis starts its November cycle on payday (30 Oct 2026)
insert into public.budget_cycles (space_id, starts_on)
values ('71150d11-94c1-4114-9b8c-ec14bed697ed', '2026-10-30')
on conflict do nothing;
