-- Variable recurring payments (electricity, water, internet): recognized by name and date whatever the amount,
-- and their expected amount is the average of the last 3 payments.
alter table public.recurring add column if not exists variable boolean not null default false;

-- Keeps a variable recurring's amount at the average of its last 3 payments, and last_paid_on at the latest one.
create or replace function public.recurring_refresh_amount(p_rec uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record; avg_amt numeric; last_d date;
begin
  select * into r from public.recurring where id = p_rec;
  if r.id is null then return; end if;
  select max((occurred_at at time zone 'America/Costa_Rica')::date) into last_d
  from public.transactions where recurring_id = p_rec and kind = 'expense' and hold is distinct from 'void';
  if last_d is not null and (r.last_paid_on is null or last_d > r.last_paid_on) then
    update public.recurring set last_paid_on = last_d where id = p_rec;
  end if;
  if not r.variable then return; end if;
  select avg(v) into avg_amt from (
    select case when r.currency = 'USD'
             then case when t.currency = 'USD' then t.amount else t.amount_crc / nullif(public.current_fx((t.occurred_at at time zone 'America/Costa_Rica')::date), 0) end
             else t.amount_crc end as v
    from public.transactions t
    where t.recurring_id = p_rec and t.kind = 'expense' and t.hold is distinct from 'void'
    order by t.occurred_at desc limit 3
  ) x;
  if avg_amt is not null and avg_amt > 0 then
    update public.recurring set amount = round(avg_amt, case when r.currency = 'USD' then 2 else 0 end) where id = p_rec;
  end if;
end $$;

create or replace function public.tx_recurring_amount() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' and old.recurring_id is not null and (tg_op = 'DELETE' or old.recurring_id is distinct from new.recurring_id) then
    perform public.recurring_refresh_amount(old.recurring_id);
  end if;
  if tg_op <> 'DELETE' and new.recurring_id is not null then
    perform public.recurring_refresh_amount(new.recurring_id);
  end if;
  return null;
end $$;

create trigger transactions_recurring_amount
after insert or update of recurring_id, amount, hold or delete on public.transactions
for each row execute function public.tx_recurring_amount();

-- Turning a recurring variable links its past bills (same name, not linked to anything yet) and sets its average.
create or replace function public.recurring_variable_backfill() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.variable and new.kind = 'expense' and coalesce(new.match_pattern, '') <> '' then
    update public.transactions t set recurring_id = new.id
    where t.space_id = new.space_id and t.recurring_id is null and t.kind = 'expense'
      and t.source in ('email', 'import') and t.hold is distinct from 'void'
      and upper(coalesce(t.raw_merchant, t.merchant, '')) not like 'IVA %'
      and upper(coalesce(t.raw_merchant, '') || ' ' || coalesce(t.merchant, '')) like '%' || upper(new.match_pattern) || '%';
    perform public.recurring_refresh_amount(new.id);
  end if;
  return null;
end $$;

create trigger recurring_variable_backfill
after insert or update of variable, match_pattern on public.recurring
for each row execute function public.recurring_variable_backfill();

-- Matching new vouchers: a variable recurring ignores the amount, only name and date count.
create or replace function public.match_recurring()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
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
      and upper(coalesce(new.raw_merchant, '') || ' ' || coalesce(new.merchant, '')) like '%' || upper(match_pattern) || '%'
    order by next_due
  loop
    lead := least(10, greatest(2, public.period_days(r.frequency) / 3));
    expected := r.amount * case when r.currency = 'USD' then public.current_fx(d) else 1 end;
    if d between r.next_due - lead and r.next_due + greatest(lead, least(31, public.period_days(r.frequency)))
       and (r.variable or amt between expected * 0.65 and expected * 1.35) then
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
end $function$;

create or replace function public.link_recurring(p_tx uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t public.transactions; r record; d date; lead integer; amt numeric; expected numeric; nd date;
begin
  select * into t from public.transactions where id = p_tx;
  if t.id is null or t.recurring_id is not null or t.kind <> 'expense' then return; end if;
  d := (t.occurred_at at time zone 'America/Costa_Rica')::date;
  amt := t.amount * coalesce(t.fx_rate, 1);
  for r in
    select * from public.recurring
    where space_id = t.space_id and active and kind = 'expense' and coalesce(match_pattern, '') <> ''
      and upper(coalesce(t.raw_merchant, '') || ' ' || coalesce(t.merchant, '')) like '%' || upper(match_pattern) || '%'
    order by next_due
  loop
    lead := least(10, greatest(2, public.period_days(r.frequency) / 3));
    expected := r.amount * case when r.currency = 'USD' then public.current_fx(d) else 1 end;
    if d between r.next_due - lead and r.next_due + greatest(lead, least(31, public.period_days(r.frequency)))
       and (r.variable or amt between expected * 0.65 and expected * 1.35) then
      update public.transactions set recurring_id = r.id where id = t.id;
      nd := r.next_due;
      while nd <= d + lead loop nd := public.add_period(nd, r.frequency); end loop;
      update public.recurring set next_due = nd, last_paid_on = greatest(coalesce(last_paid_on, d), d) where id = r.id;
      return;
    end if;
  end loop;
end $$;

revoke execute on function public.recurring_refresh_amount(uuid) from public, anon, authenticated;
