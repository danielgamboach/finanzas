-- Sobres (docs/comportamiento/presupuesto.md, SOB): what can be spent on something per week, fortnight or month.
-- Categories only classify now; their limits move to envelopes (SOB-09).

create table if not exists public.envelopes (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces on delete cascade,
  name text not null check (length(trim(name)) > 0),
  amount numeric(16,2) check (amount > 0),
  currency text not null default 'CRC' check (currency in ('CRC','USD')),
  period text not null default 'monthly' check (period in ('weekly','biweekly','monthly')),
  -- "Todo lo demás": one per space, takes whatever no other envelope takes (SOB-05)
  is_rest boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  check (is_rest or amount is not null)
);
create unique index if not exists envelopes_one_rest on public.envelopes (space_id) where is_rest;
alter table public.envelopes enable row level security;
create policy envelopes_all on public.envelopes for all to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));

-- A category lives in one envelope at most (SOB-01).
create table if not exists public.envelope_categories (
  category_id uuid primary key references public.categories on delete cascade,
  envelope_id uuid not null references public.envelopes on delete cascade
);
create index if not exists envelope_categories_env on public.envelope_categories (envelope_id);
alter table public.envelope_categories enable row level security;
create policy envelope_categories_all on public.envelope_categories for all to authenticated
  using (exists (select 1 from public.envelopes e where e.id = envelope_id and public.is_space_member(e.space_id)))
  with check (exists (select 1 from public.envelopes e join public.categories c on c.id = category_id
                      where e.id = envelope_id and not e.is_rest and c.space_id = e.space_id and c.kind = 'expense'
                        and public.is_space_member(e.space_id)));

-- A parent and one of its subcategories can't be in different envelopes (SOB-01).
create or replace function public.check_envelope_category() returns trigger
language plpgsql security definer set search_path = public as $$
declare clash text;
begin
  select e.name into clash
  from public.envelope_categories ec
  join public.envelopes e on e.id = ec.envelope_id
  join public.categories c on c.id = ec.category_id
  join public.categories me on me.id = new.category_id
  where ec.envelope_id <> new.envelope_id
    and (c.id = me.parent_id or c.parent_id = me.id)
  limit 1;
  if clash is not null then
    raise exception 'Esa categoría ya está en el sobre %', clash;
  end if;
  return new;
end $$;
create trigger envelope_categories_check before insert or update on public.envelope_categories
  for each row execute function public.check_envelope_category();

-- Start and end (CR dates, end exclusive) of the current period of an envelope (SOB-03).
create or replace function public.envelope_period(p_period text, p_week_start int, p_day date)
returns table (p_from date, p_to date) language sql immutable as $$
  select case p_period
           when 'weekly' then p_day - ((extract(dow from p_day)::int - p_week_start + 7) % 7)
           when 'biweekly' then case when extract(day from p_day) <= 15 then date_trunc('month', p_day)::date
                                     else date_trunc('month', p_day)::date + 15 end
           else date_trunc('month', p_day)::date end,
         case p_period
           when 'weekly' then p_day - ((extract(dow from p_day)::int - p_week_start + 7) % 7) + 7
           when 'biweekly' then case when extract(day from p_day) <= 15 then date_trunc('month', p_day)::date + 15
                                     else (date_trunc('month', p_day) + interval '1 month')::date end
           else (date_trunc('month', p_day) + interval '1 month')::date end
$$;

-- Alerts at 80% and 100% now follow envelopes instead of category limits.
create or replace function public.check_limit_alert() returns trigger
language plpgsql security definer set search_path = public as $$
declare e record; s record; today date; d date; p_from date; p_to date; spent numeric; pct numeric; cap numeric;
  who text; label text; fx numeric;
begin
  if new.kind not in ('expense', 'refund') or new.category_id is null or new.hold is not null then return null; end if;
  select en.* into e from public.envelopes en
  join public.envelope_categories ec on ec.envelope_id = en.id
  join public.categories c on c.id = new.category_id
  where ec.category_id in (c.id, c.parent_id)
  limit 1;
  if e is null or e.amount is null then return null; end if;
  select * into s from public.spaces where id = new.space_id;
  today := (now() at time zone 'America/Costa_Rica')::date;
  d := (new.occurred_at at time zone 'America/Costa_Rica')::date;
  select ep.p_from, ep.p_to into p_from, p_to from public.envelope_period(e.period, s.week_start, today) ep;
  if d < p_from or d >= p_to then return null; end if;
  label := case e.period when 'weekly' then 'esta semana' when 'biweekly' then 'esta quincena' else 'este mes' end;
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
      who || ' ' || public.crc_text(spent) || ' de ' || public.crc_text(cap) || ' ' || label || ' (' || public.crc_text(spent - cap) || ' de más).',
      '/#/sobre/' || e.id);
  elsif pct >= 80 then
    perform public.notify_space(s.id, 'env80:' || e.id || ':' || p_from, 'limits',
      e.name || ' al ' || floor(pct)::int || '%',
      who || ' ' || public.crc_text(spent) || ' de ' || public.crc_text(cap) || ' ' || label || '. Quedan ' || public.crc_text(cap - spent) || '.',
      '/#/sobre/' || e.id);
  end if;
  return null;
end $$;

-- SOB-09: every category limit becomes an envelope with that category; then categories stop having limits.
with src as (
  select c.id, c.space_id, c.name, c.limit_amount, c.limit_period, c.sort
  from public.categories c
  where c.kind = 'expense' and not c.archived and c.parent_id is null and c.limit_amount > 0
), made as (
  insert into public.envelopes (space_id, name, amount, period, sort)
  select space_id, name, limit_amount, case when limit_period = 'weekly' then 'weekly' else 'monthly' end, sort from src
  returning id, space_id, name
)
insert into public.envelope_categories (category_id, envelope_id)
select s.id, m.id from src s join made m on m.space_id = s.space_id and m.name = s.name
on conflict do nothing;

insert into public.envelopes (space_id, name, is_rest, sort)
select id, 'Todo lo demás', true, 1000 from public.spaces
on conflict do nothing;

update public.categories set limit_amount = null, limit_period = null where limit_amount is not null;
