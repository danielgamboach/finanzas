-- Recurring payments v2: expected payments with a frequency and a next due date.
-- Card payments are confirmed automatically when their voucher arrives; transfers and cash
-- are confirmed by the user from the app. Nothing is auto-generated anymore.

alter table public.recurring
  add column if not exists frequency text not null default 'monthly'
    check (frequency in ('weekly','biweekly','monthly','bimonthly','quarterly','semiannual','yearly')),
  add column if not exists next_due date not null default current_date,
  add column if not exists method text not null default 'card' check (method in ('card','transfer','cash')),
  add column if not exists match_pattern text,
  add column if not exists last_paid_on date,
  add column if not exists notes text;
alter table public.recurring alter column day_of_month set default 1; -- legacy column, unused
create index if not exists recurring_space_due on public.recurring (space_id, next_due) where active;

-- Credit cards always accept charges in both currencies; the app treats them as mixed.

create or replace function public.period_days(f text) returns integer language sql immutable as $$
  select case f when 'weekly' then 7 when 'biweekly' then 14 when 'monthly' then 30 when 'bimonthly' then 61
    when 'quarterly' then 91 when 'semiannual' then 182 else 365 end;
$$;

create or replace function public.add_period(d date, f text) returns date language sql immutable as $$
  select case f
    when 'weekly' then d + 7
    when 'biweekly' then d + 14
    when 'monthly' then (d + interval '1 month')::date
    when 'bimonthly' then (d + interval '2 months')::date
    when 'quarterly' then (d + interval '3 months')::date
    when 'semiannual' then (d + interval '6 months')::date
    else (d + interval '1 year')::date end;
$$;

-- Before insert: link incoming vouchers/imports to the recurring payment they settle.
create or replace function public.match_recurring() returns trigger language plpgsql security definer set search_path = public as $$
declare r record; d date; lead integer; amt numeric; expected numeric;
begin
  if new.recurring_id is not null or new.kind <> 'expense' or new.source not in ('email','import') then return new; end if;
  if upper(coalesce(new.raw_merchant, new.merchant, '')) like 'IVA %' then return new; end if;
  d := (new.occurred_at at time zone 'America/Costa_Rica')::date;
  amt := new.amount * coalesce(new.fx_rate, 1);
  for r in
    select * from public.recurring
    where space_id = new.space_id and active and kind = 'expense'
      and coalesce(match_pattern, '') <> ''
      and upper(coalesce(new.raw_merchant, new.merchant, '')) like '%' || upper(match_pattern) || '%'
    order by next_due
  loop
    lead := least(10, greatest(2, public.period_days(r.frequency) / 3));
    expected := r.amount * case when r.currency = 'USD' then public.current_fx(d) else 1 end;
    if d between r.next_due - lead and r.next_due + greatest(lead, least(31, public.period_days(r.frequency)))
       and amt between expected * 0.65 and expected * 1.35 then
      new.recurring_id := r.id;
      if new.category_id is null and r.category_id is not null then
        new.category_id := r.category_id;
        new.status := 'posted';
        new.category_source := 'auto';
      end if;
      return new;
    end if;
  end loop;
  return new;
end $$;

create trigger transactions_a_recurring before insert on public.transactions
  for each row execute function public.match_recurring();

-- After insert: a payment linked to a recurring item moves its next due date forward.
create or replace function public.advance_recurring() returns trigger language plpgsql security definer set search_path = public as $$
declare r record; d date; lead integer; nd date;
begin
  if new.recurring_id is null then return null; end if;
  select * into r from public.recurring where id = new.recurring_id;
  if r is null then return null; end if;
  d := (new.occurred_at at time zone 'America/Costa_Rica')::date;
  lead := least(10, greatest(2, public.period_days(r.frequency) / 3));
  nd := r.next_due;
  while nd <= d + lead loop
    nd := public.add_period(nd, r.frequency);
  end loop;
  update public.recurring set next_due = nd, last_paid_on = greatest(coalesce(last_paid_on, d), d) where id = r.id;
  return null;
end $$;

create trigger transactions_z_advance_recurring after insert on public.transactions
  for each row execute function public.advance_recurring();

-- Suggestions dismissed by the user ("no es una suscripción")
create table if not exists public.recurring_dismissals (
  space_id uuid not null references public.spaces on delete cascade,
  merchant_key text not null,
  created_at timestamptz not null default now(),
  primary key (space_id, merchant_key)
);
alter table public.recurring_dismissals enable row level security;
create policy "members manage dismissals" on public.recurring_dismissals for all to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));
grant select, insert, delete on public.recurring_dismissals to authenticated;

-- Charges that look like a monthly subscription and aren't tracked yet.
create or replace function public.recurring_suggestions(p_space uuid)
returns table (merchant_key text, merchant text, raw_merchant text, currency text, amount numeric, months integer,
               last_date date, next_guess date, category_id uuid, account_id uuid)
language sql stable security invoker set search_path = public as $$
  with tx as (
    select t.merchant_key, t.merchant, t.raw_merchant, t.currency, t.amount, t.category_id, t.account_id,
           (t.occurred_at at time zone 'America/Costa_Rica')::date d
    from public.transactions t
    where t.space_id = p_space and t.kind = 'expense' and t.recurring_id is null
      and t.occurred_at > now() - interval '200 days'
      and coalesce(t.merchant_key, '') <> '' and upper(coalesce(t.raw_merchant, t.merchant, '')) not like 'IVA %'
  ), g as (
    select merchant_key, currency,
           percentile_cont(0.5) within group (order by amount) med,
           count(distinct date_trunc('month', d)) months, count(*) n, max(d) last_date, min(d) first_date
    from tx group by 1, 2
  )
  select g.merchant_key,
         (select merchant from tx where tx.merchant_key = g.merchant_key order by d desc limit 1),
         (select raw_merchant from tx where tx.merchant_key = g.merchant_key order by d desc limit 1),
         g.currency, round(g.med::numeric, 2), g.months::int, g.last_date,
         (g.last_date + interval '1 month')::date,
         (select category_id from tx where tx.merchant_key = g.merchant_key and category_id is not null order by d desc limit 1),
         (select account_id from tx where tx.merchant_key = g.merchant_key order by d desc limit 1)
  from g
  where g.months >= 2
    and g.n <= g.months + 1                                   -- about one charge per month
    and (g.last_date - g.first_date) >= 25
    and g.last_date > current_date - 45                       -- still active
    and (select count(*) from tx where tx.merchant_key = g.merchant_key and tx.currency = g.currency
           and tx.amount between g.med * 0.85 and g.med * 1.15) >= g.n - 1   -- steady amount
    and not exists (select 1 from public.recurring r where r.space_id = p_space and r.active
                    and coalesce(r.match_pattern, '') <> '' and g.merchant_key like '%' || upper(r.match_pattern) || '%')
    and not exists (select 1 from public.recurring_dismissals x where x.space_id = p_space and x.merchant_key = g.merchant_key)
  order by g.last_date desc
  limit 12;
$$;
grant execute on function public.recurring_suggestions(uuid) to authenticated;

-- The old monthly auto-generation is retired: recurring items are expectations now.
create or replace function public.generate_recurring_for(u uuid, p_today date default (now() at time zone 'America/Costa_Rica')::date)
returns integer language sql security definer set search_path = public as $$ select 0 $$;
