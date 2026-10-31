-- Presupuesto como lista de partidas (docs/comportamiento/presupuesto.md, PPT): pago fijo, tope o ahorro, todo mensual.
-- Reuses the envelopes tables: an envelope is now a budget line with a kind.

alter table public.envelopes
  add column if not exists kind text not null default 'cap' check (kind in ('fixed','cap','saving')),
  -- fixed: one recurrent (created from Presupuesto) or every recurrent of a category (Suscripciones)
  add column if not exists recurring_id uuid references public.recurring on delete set null,
  add column if not exists group_category_id uuid references public.categories on delete set null,
  -- saving: the account the money goes to (optional)
  add column if not exists account_id uuid references public.accounts on delete set null,
  add column if not exists active boolean not null default true;

-- Everything is monthly now (PPT-01).
update public.envelopes set period = 'monthly' where period <> 'monthly';

-- The salary of the space, typed once and repeated every month (PPT-05).
create table if not exists public.budget_settings (
  space_id uuid primary key references public.spaces on delete cascade,
  income numeric(16,2) check (income >= 0),
  currency text not null default 'CRC' check (currency in ('CRC','USD'))
);
alter table public.budget_settings enable row level security;
create policy budget_settings_all on public.budget_settings for all to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));

-- "Aparté": a saving line marked by hand for a month (PPT-04).
create table if not exists public.envelope_marks (
  envelope_id uuid not null references public.envelopes on delete cascade,
  month date not null check (extract(day from month) = 1),
  created_at timestamptz not null default now(),
  primary key (envelope_id, month)
);
alter table public.envelope_marks enable row level security;
create policy envelope_marks_all on public.envelope_marks for all to authenticated
  using (exists (select 1 from public.envelopes e where e.id = envelope_id and public.is_space_member(e.space_id)))
  with check (exists (select 1 from public.envelopes e where e.id = envelope_id and public.is_space_member(e.space_id)));

-- Categories can only be linked to a "tope" line.
alter policy envelope_categories_all on public.envelope_categories
  with check (exists (select 1 from public.envelopes e join public.categories c on c.id = category_id
                      where e.id = envelope_id and not e.is_rest and e.kind = 'cap' and c.space_id = e.space_id and c.kind = 'expense'
                        and public.is_space_member(e.space_id)));

-- Alerts at 80% and 100% only for "tope" lines, per month.
create or replace function public.check_limit_alert() returns trigger
language plpgsql security definer set search_path = public as $$
declare e record; s record; today date; d date; p_from date; p_to date; spent numeric; pct numeric; cap numeric;
  who text; fx numeric;
begin
  if new.kind not in ('expense', 'refund') or new.category_id is null or new.hold is not null then return null; end if;
  select en.* into e from public.envelopes en
  join public.envelope_categories ec on ec.envelope_id = en.id
  join public.categories c on c.id = new.category_id
  where ec.category_id in (c.id, c.parent_id) and en.kind = 'cap' and en.active and not en.is_rest
  limit 1;
  if e is null or e.amount is null then return null; end if;
  select * into s from public.spaces where id = new.space_id;
  today := (now() at time zone 'America/Costa_Rica')::date;
  d := (new.occurred_at at time zone 'America/Costa_Rica')::date;
  p_from := date_trunc('month', today)::date; p_to := (p_from + interval '1 month')::date;
  if d < p_from or d >= p_to then return null; end if;
  cap := e.amount;
  if e.currency = 'USD' then
    select crc_per_usd into fx from public.fx_rates order by rate_date desc limit 1;
    cap := e.amount * coalesce(fx, 500);
  end if;
  select coalesce(sum(case when t.kind = 'expense' then t.amount_crc else -t.amount_crc end), 0) into spent
  from public.transactions t
  join public.categories c on c.id = t.category_id
  where t.space_id = new.space_id
    and t.kind in ('expense', 'refund') and t.hold is null
    and exists (select 1 from public.envelope_categories ec where ec.envelope_id = e.id and ec.category_id in (c.id, c.parent_id))
    and t.occurred_at >= (p_from::timestamp at time zone 'America/Costa_Rica')
    and t.occurred_at < (p_to::timestamp at time zone 'America/Costa_Rica');
  pct := spent / cap * 100;
  who := case when s.kind = 'shared' then 'Llevan' else 'Llevás' end;
  if pct >= 100 then
    insert into public.notification_log (space_id, key) values (s.id, 'env80:' || e.id || ':' || p_from) on conflict do nothing;
    perform public.notify_space(s.id, 'env100:' || e.id || ':' || p_from, 'limits',
      case when s.kind = 'shared' then 'Se pasaron en ' else 'Te pasaste en ' end || e.name,
      who || ' ' || public.crc_text(spent) || ' de ' || public.crc_text(cap) || ' este mes (' || public.crc_text(spent - cap) || ' de más).',
      '/#/partida/' || e.id);
  elsif pct >= 80 then
    perform public.notify_space(s.id, 'env80:' || e.id || ':' || p_from, 'limits',
      e.name || ' al ' || floor(pct)::int || '%',
      who || ' ' || public.crc_text(spent) || ' de ' || public.crc_text(cap) || ' este mes. Quedan ' || public.crc_text(cap - spent) || '.',
      '/#/partida/' || e.id);
  end if;
  return null;
end $$;
