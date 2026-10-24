-- Apple subscriptions: the bank only says "APPLE.COM/BILL CUPERTINO". Apple's receipt emails say what
-- it was ("YouTube Premium", "iCloud+ 2 TB"…). The Google script sends each receipt here
-- (ingest_apple_receipt) and it is paired with the card charge of the same amount within 3 days.
-- The movement then shows the app's name ("YouTube"), gets its own catalog merchant and can have its
-- own recurring payment. The bank's name stays in raw_merchant. When it isn't clear which charge a
-- receipt belongs to, nothing changes: the movement stays as "Apple".

create table public.apple_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  order_id text not null,
  received_at timestamptz not null,
  app text not null check (length(btrim(app)) > 0),
  plan text,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null check (currency in ('USD', 'CRC')),
  last4 text,
  transaction_id uuid, -- no foreign key: movements come and go; the pairing is checked when used
  matched_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, order_id)
);
create index apple_receipts_pending on public.apple_receipts (user_id, amount) where transaction_id is null;
create unique index apple_receipts_tx on public.apple_receipts (transaction_id) where transaction_id is not null;
alter table public.apple_receipts enable row level security;
create policy "apple receipts: own or of a visible movement" on public.apple_receipts for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.transactions t where t.id = transaction_id));
grant select on public.apple_receipts to authenticated;

-- "HBO Max: Ve TV y películas" → "HBO Max"; "Todoist: To do list–Calendario" → "Todoist"
create or replace function public.apple_app_name(p text) returns text
language sql immutable set search_path = public as $$
  select left(btrim(split_part(coalesce(p, ''), ':', 1)), 60);
$$;

-- A catalog merchant for the app, unless its name already leads to one other than Apple itself.
create or replace function public.ensure_app_merchant(p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare apple uuid := public.resolve_merchant('APPLE.COM/BILL CUPERTINO', null); cur uuid; m uuid;
begin
  if length(public.merchant_norm(p_name)) < 3 then return; end if;
  cur := public.resolve_merchant(null, p_name);
  if cur is not null and cur is distinct from apple then return; end if;
  if exists (select 1 from public.merchant_patterns where norm = public.merchant_norm(p_name) and active) then return; end if;
  insert into public.merchants (name, created_by) values (p_name, null) returning id into m;
  insert into public.merchant_patterns (merchant_id, pattern, source, created_by) values (m, p_name, 'seed', null);
end $$;

-- Ties a movement to the recurring payment its (new) name matches, and moves that payment forward,
-- the same way match_recurring + advance_recurring do on insert.
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
       and amt between expected * 0.65 and expected * 1.35 then
      update public.transactions set recurring_id = r.id where id = t.id;
      nd := r.next_due;
      while nd <= d + lead loop nd := public.add_period(nd, r.frequency); end loop;
      update public.recurring set next_due = nd, last_paid_on = greatest(coalesce(last_paid_on, d), d) where id = r.id;
      return;
    end if;
  end loop;
end $$;

-- Pending receipts that could be this charge, nearest first.
create or replace function public.apple_pending_for(p_space uuid, p_account uuid, p_amount numeric, p_currency text, p_at timestamptz)
returns table (id uuid, app text, dist double precision)
language sql stable security definer set search_path = public as $$
  select ar.id, public.apple_app_name(ar.app), abs(extract(epoch from (ar.received_at - p_at)))::double precision
  from public.apple_receipts ar
  where ar.currency = p_currency and ar.amount = p_amount
    and (ar.transaction_id is null or not exists (select 1 from public.transactions x where x.id = ar.transaction_id))
    and abs(extract(epoch from (ar.received_at - p_at))) <= 3 * 86400
    and exists (select 1 from public.space_members m where m.space_id = p_space and m.user_id = ar.user_id)
    and (ar.last4 is null or not exists (select 1 from public.accounts a where a.id = p_account and a.last4 is not null and a.last4 <> ar.last4))
  order by 3;
$$;

-- A new Apple charge whose receipt already arrived: name it before the rest of the insert triggers run
-- (this trigger's name sorts first), so the catalog, the category history and recurring payments see it.
create or replace function public.apple_receipt_on_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare best record; other record;
begin
  if new.kind <> 'expense' or upper(coalesce(new.raw_merchant, '')) not like 'APPLE.COM%' then return new; end if;
  select * into best from public.apple_pending_for(new.space_id, new.account_id, new.amount, new.currency, new.occurred_at) limit 1;
  if best.id is null then return new; end if;
  -- another receipt for a different app about as close: don't guess
  select * into other from public.apple_pending_for(new.space_id, new.account_id, new.amount, new.currency, new.occurred_at) p
  where p.id <> best.id and p.app <> best.app and p.dist <= best.dist + 86400 limit 1;
  if other.id is not null then return new; end if;
  perform public.ensure_app_merchant(best.app);
  new.merchant := best.app;
  return new;
end $$;
create trigger transactions_0_apple before insert on public.transactions
  for each row execute function public.apple_receipt_on_insert();

-- After the insert really happened (not skipped as a duplicate), remember which receipt it used.
create or replace function public.apple_receipt_mark() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind <> 'expense' or upper(coalesce(new.raw_merchant, '')) not like 'APPLE.COM%' then return null; end if;
  update public.apple_receipts set transaction_id = new.id, matched_at = now()
  where id = (select p.id from public.apple_pending_for(new.space_id, new.account_id, new.amount, new.currency, new.occurred_at) p
              where p.app = new.merchant limit 1);
  return null;
end $$;
create trigger transactions_z_apple_mark after insert on public.transactions
  for each row execute function public.apple_receipt_mark();

-- A receipt for a charge that is already in the app: find it and rename it.
create or replace function public.apple_match_receipt(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare r public.apple_receipts; apple uuid := public.resolve_merchant('APPLE.COM/BILL CUPERTINO', null); best record; nm text;
begin
  select * into r from public.apple_receipts where id = p_id;
  if r.id is null then return null; end if;
  if r.transaction_id is not null and exists (select 1 from public.transactions where id = r.transaction_id) then return r.transaction_id; end if;
  select c.id, c.dist, lead(c.dist) over (order by c.dist) as next_dist into best
  from (
    select tx.id, abs(extract(epoch from (r.received_at - tx.occurred_at)))::double precision as dist
    from public.transactions tx
    left join public.accounts a on a.id = tx.account_id
    where tx.kind = 'expense' and upper(coalesce(tx.raw_merchant, '')) like 'APPLE.COM%'
      and tx.currency = r.currency and tx.amount = r.amount
      and abs(extract(epoch from (r.received_at - tx.occurred_at))) <= 3 * 86400
      and exists (select 1 from public.space_members m where m.space_id = tx.space_id and m.user_id = r.user_id)
      and (r.last4 is null or a.last4 is null or a.last4 = r.last4)
      and (tx.merchant_id is null or tx.merchant_id = apple)
      and not exists (select 1 from public.apple_receipts x where x.transaction_id = tx.id and x.id <> r.id)
  ) c
  order by c.dist
  limit 1;
  if best.id is null then return null; end if;
  -- two charges of the same amount about as close: don't guess
  if best.next_dist is not null and best.next_dist <= best.dist + 86400 then return null; end if;
  nm := public.apple_app_name(r.app);
  perform public.ensure_app_merchant(nm);
  update public.apple_receipts set transaction_id = best.id, matched_at = now() where id = r.id;
  update public.transactions set merchant = nm where id = best.id;
  perform public.link_recurring(best.id);
  return best.id;
end $$;

-- Called by the Google script, one receipt at a time (with the person's token).
create or replace function public.ingest_apple_receipt(p_token text, p_order_id text, p_received_at timestamptz,
  p_app text, p_plan text, p_amount numeric, p_currency text default 'USD', p_last4 text default null) returns text
language plpgsql security definer set search_path = public as $$
declare u uuid; rid uuid; tx uuid;
begin
  u := public.token_user(p_token);
  if coalesce(p_amount, 0) <= 0 then return 'free'; end if;
  insert into public.apple_receipts (user_id, order_id, received_at, app, plan, amount, currency, last4)
  values (u, left(p_order_id, 80), p_received_at, left(btrim(p_app), 120), left(btrim(p_plan), 200), round(p_amount, 2),
          upper(coalesce(p_currency, 'USD')), nullif(right(coalesce(p_last4, ''), 4), ''))
  on conflict (user_id, order_id) do nothing
  returning id into rid;
  if rid is null then
    select id into rid from public.apple_receipts where user_id = u and order_id = left(p_order_id, 80);
  end if;
  tx := public.apple_match_receipt(rid);
  return case when tx is null then 'pending' else 'matched' end;
end $$;

revoke execute on function public.ensure_app_merchant(text), public.link_recurring(uuid),
  public.apple_pending_for(uuid, uuid, numeric, text, timestamptz), public.apple_receipt_on_insert(),
  public.apple_receipt_mark(), public.apple_match_receipt(uuid) from public, anon, authenticated;
revoke execute on function public.ingest_apple_receipt(text, text, timestamptz, text, text, numeric, text, text) from public;
grant execute on function public.ingest_apple_receipt(text, text, timestamptz, text, text, numeric, text, text) to anon, authenticated;

-- Recurring payments also match the movement's clean name, so "YOUTUBE" finds an Apple charge renamed YouTube.
create or replace function public.match_recurring() returns trigger
language plpgsql security definer set search_path = public as $$
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

-- Suggestions: each Apple subscription on its own (keyed by its app name, with no bank name, so the
-- recurring payment the app creates matches "YOUTUBE" and not every "APPLE.COM").
create or replace function public.recurring_suggestions(p_space uuid)
returns table (merchant_key text, merchant text, raw_merchant text, currency text, amount numeric, months integer,
  last_date date, next_guess date, category_id uuid, account_id uuid)
language sql stable set search_path = public as $$
  with tx as (
    select case
             when t.via_apple then upper(t.merchant)
             when length(split_part(t.merchant_key, ' ', 1)) >= 5 then split_part(t.merchant_key, ' ', 1)
             else t.merchant_key end k,
           t.merchant, case when t.via_apple then null else t.raw_merchant end raw_merchant,
           t.currency, t.amount, t.category_id, t.account_id,
           (t.occurred_at at time zone 'America/Costa_Rica')::date d
    from (select x.*, upper(coalesce(x.raw_merchant, '')) like 'APPLE.COM%' and lower(coalesce(x.merchant, 'apple')) <> 'apple' as via_apple
          from public.transactions x) t
    where t.space_id = p_space and t.kind = 'expense' and t.recurring_id is null
      and t.occurred_at > now() - interval '200 days'
      and coalesce(t.merchant_key, '') <> '' and upper(coalesce(t.raw_merchant, t.merchant, '')) not like 'IVA %'
  ), gaps as (
    select k, currency, d, amount, d - lag(d) over (partition by k, currency order by d) gap from tx
  ), g as (
    select k, currency,
           percentile_cont(0.5) within group (order by amount) med,
           count(distinct date_trunc('month', d)) months, count(*) n, max(d) last_date,
           min(gap) min_gap, max(gap) max_gap
    from gaps group by 1, 2
  )
  select g.k,
         (select merchant from tx where tx.k = g.k order by d desc limit 1),
         (select raw_merchant from tx where tx.k = g.k order by d desc limit 1),
         g.currency, round(g.med::numeric, 2), g.months::int, g.last_date,
         (g.last_date + interval '1 month')::date,
         (select category_id from tx where tx.k = g.k and category_id is not null order by d desc limit 1),
         (select account_id from tx where tx.k = g.k order by d desc limit 1)
  from g
  where g.months >= 2 and g.n = g.months
    and g.min_gap >= 24 and g.max_gap <= 38
    and g.last_date > current_date - 40
    and (select count(*) from tx where tx.k = g.k and tx.currency = g.currency
           and tx.amount between g.med * 0.85 and g.med * 1.15) = g.n
    and not exists (select 1 from public.recurring r where r.space_id = p_space and r.active and coalesce(r.match_pattern, '') <> ''
                    and (g.k like '%' || upper(r.match_pattern) || '%' or upper(r.match_pattern) like '%' || g.k || '%'))
    and not exists (select 1 from public.recurring_dismissals x where x.space_id = p_space and x.merchant_key = g.k)
  order by g.months desc, g.last_date desc
  limit 12;
$$;
