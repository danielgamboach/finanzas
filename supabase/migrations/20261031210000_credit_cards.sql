-- Credit cards (TAR): statement and due days, credit limit, additional cards that share the main card's balance,
-- a balance per currency that payments reduce by what was paid, and early payments as a recurring of the card.

alter table public.accounts
  add column if not exists statement_day smallint check (statement_day between 1 and 31),
  add column if not exists due_day smallint check (due_day between 1 and 31),
  add column if not exists credit_limit numeric check (credit_limit is null or credit_limit >= 0),
  add column if not exists parent_account_id uuid references public.accounts(id) on delete set null;

-- a card's typed-in balance has a part in each currency: balance (colones) and balance_usd
alter table public.balance_snapshots add column if not exists balance_usd numeric;

-- what a recurring is for: 'card_early' = early payments of a credit card (to_account_id)
alter table public.recurring add column if not exists purpose text check (purpose in ('card_early'));

-- An additional card belongs to a main card of the same space, which isn't itself additional.
create or replace function public.check_card_parent() returns trigger language plpgsql security definer set search_path = public as $$
declare p record;
begin
  if new.parent_account_id is null then return new; end if;
  if new.kind <> 'credit_card' or new.parent_account_id = new.id then raise exception 'Solo una tarjeta puede ser adicional de otra'; end if;
  select * into p from public.accounts where id = new.parent_account_id;
  if p.id is null or p.kind <> 'credit_card' or p.space_id <> new.space_id or p.parent_account_id is not null then
    raise exception 'La tarjeta principal tiene que ser otra tarjeta del mismo espacio';
  end if;
  if exists (select 1 from public.accounts where parent_account_id = new.id) then
    raise exception 'Esta tarjeta ya tiene adicionales: no puede ser adicional de otra';
  end if;
  return new;
end $$;
create or replace trigger accounts_card_parent before insert or update of parent_account_id, kind, space_id on public.accounts
  for each row execute function public.check_card_parent();

create or replace function public.card_main(p uuid) returns uuid language sql stable set search_path = public as $$
  select coalesce(parent_account_id, id) from public.accounts where id = p
$$;

-- When a typed-in balance was true (same rule as snapshotMoment in src/lib/calc.ts).
create or replace function public.snapshot_moment(p_taken date, p_created timestamptz) returns timestamptz language sql immutable as $$
  select case when p_created is not null and (p_created at time zone 'America/Costa_Rica')::date = p_taken then p_created
              else ((p_taken + 1)::timestamp at time zone 'America/Costa_Rica') - interval '1 millisecond' end
$$;

-- The last statement date strictly before the day of p_at (the cut closes at the end of its day).
create or replace function public.card_last_cut(p_day int, p_at timestamptz) returns date language plpgsql immutable as $$
declare today date := (p_at at time zone 'America/Costa_Rica')::date; m date := date_trunc('month', today)::date; c date;
begin
  c := m + (least(p_day, extract(day from (m + interval '1 month - 1 day'))::int) - 1);
  if c < today then return c; end if;
  m := (m - interval '1 month')::date;
  return m + (least(p_day, extract(day from (m + interval '1 month - 1 day'))::int) - 1);
end $$;

-- What a card (with its additional cards) owes at p_at, in colones and in dollars: the last typed-in balance plus
-- charges, minus refunds and payments since. Without one, it counts from the previous statement (or the month).
create or replace function public.card_owed(p_card uuid, p_at timestamptz default now())
returns table (crc numeric, usd numeric) language plpgsql stable security definer set search_path = public as $$
declare main uuid := public.card_main(p_card); sd int; b_crc numeric := 0; b_usd numeric := 0; b_at timestamptz;
begin
  if not exists (select 1 from public.accounts a where a.id = main and public.is_space_member(a.space_id)) and auth.uid() is not null then
    raise exception 'not allowed';
  end if;
  select statement_day into sd from public.accounts where id = main;
  select s.balance, coalesce(s.balance_usd, 0), public.snapshot_moment(s.taken_on, s.created_at) into b_crc, b_usd, b_at
  from public.balance_snapshots s where s.account_id = main and public.snapshot_moment(s.taken_on, s.created_at) <= p_at
  order by public.snapshot_moment(s.taken_on, s.created_at) desc limit 1;
  if b_at is null then
    b_crc := 0; b_usd := 0;
    b_at := case when sd is null then (date_trunc('month', p_at at time zone 'America/Costa_Rica') at time zone 'America/Costa_Rica') - interval '1 millisecond'
                 else ((public.card_last_cut(sd, p_at) + 1)::timestamp at time zone 'America/Costa_Rica') - interval '1 millisecond' end;
  end if;
  return query
  with fam as (select id from public.accounts where id = main or parent_account_id = main),
  m as (
    select t.currency,
      case when t.account_id in (select id from fam) and t.kind = 'expense' then t.amount
           when t.account_id in (select id from fam) and t.kind = 'refund' then -t.amount
           when t.to_account_id in (select id from fam) and t.kind = 'transfer' then -t.amount
           else 0 end v
    from public.transactions t
    where (t.account_id in (select id from fam) or t.to_account_id in (select id from fam))
      and t.hold is null and t.occurred_at > b_at and t.occurred_at <= p_at
  )
  select b_crc + coalesce(sum(v) filter (where currency = 'CRC'), 0), b_usd + coalesce(sum(v) filter (where currency = 'USD'), 0) from m;
end $$;
grant execute on function public.card_owed(uuid, timestamptz) to authenticated;

-- Reminders: early payment days, and the due date while the statement isn't covered (two days before and that day).
create or replace function public.card_payment_reminders() returns integer language plpgsql security definer set search_path = public as $$
declare r record; c record; today date := (now() at time zone 'America/Costa_Rica')::date; sent integer := 0;
  cut date; due date; st record; paid record; left_crc numeric; left_usd numeric; m date; txt text;
begin
  for r in select rc.*, a.name card from public.recurring rc join public.accounts a on a.id = rc.to_account_id
           where rc.purpose = 'card_early' and rc.active and coalesce(rc.snooze_until, rc.next_due) = today loop
    if public.notify_space(r.space_id, 'cardearly:' || r.id || ':' || today, 'card', 'Hoy toca pagar la tarjeta',
         'Pago anticipado de ' || r.card || '. Registrá cuánto pagaste.', '/#/') then sent := sent + 1; end if;
  end loop;
  for c in select * from public.accounts where kind = 'credit_card' and not archived and parent_account_id is null
           and statement_day is not null and due_day is not null loop
    cut := public.card_last_cut(c.statement_day, now());
    m := (date_trunc('month', cut) + case when c.due_day > c.statement_day then interval '0' else interval '1 month' end)::date;
    due := m + (least(c.due_day, extract(day from (m + interval '1 month - 1 day'))::int) - 1);
    if today < due - 2 or today > due then continue; end if;
    select * into st from public.card_owed(c.id, ((cut + 1)::timestamp at time zone 'America/Costa_Rica') - interval '1 millisecond');
    select coalesce(sum(t.amount) filter (where t.currency = 'CRC'), 0) crc, coalesce(sum(t.amount) filter (where t.currency = 'USD'), 0) usd into paid
    from public.transactions t where t.kind = 'transfer' and t.to_account_id in (select id from public.accounts where id = c.id or parent_account_id = c.id)
      and t.occurred_at > ((cut + 1)::timestamp at time zone 'America/Costa_Rica');
    left_crc := greatest(st.crc - paid.crc, 0); left_usd := greatest(st.usd - paid.usd, 0);
    if left_crc < 1 and left_usd < 0.01 then continue; end if;
    txt := concat_ws(' + ', case when left_crc >= 1 then public.crc_text(left_crc) end, case when left_usd >= 0.01 then '$' || to_char(left_usd, 'FM999G990D00') end);
    if public.notify_space(c.space_id, 'carddue:' || c.id || ':' || due || ':' || today, 'card',
         case when today = due then 'Hoy vence el pago de ' || c.name else 'Vence el pago de ' || c.name end,
         txt || ' para el pago de contado, antes del ' || extract(day from due) || '.', '/#/cuenta/' || c.id) then sent := sent + 1; end if;
  end loop;
  return sent;
end $$;
revoke execute on function public.card_payment_reminders() from public, anon, authenticated;

-- Existing cards keep what they owed: a starting balance of zero at the moment they were last paid through.
-- Simbiosis: the extension (••7731) shares the main card's balance (Tarjeta Kimmy); last weekly payment on 23 oct,
-- with ¢1.500 charged that day before it. Personal cards: from the start of October, as before.
update public.accounts set parent_account_id = '38f9cf68-fb62-4da3-b4f6-6627e40ba72c' where id = '963105df-d9fc-43d7-a533-0736e1ec916c';
insert into public.balance_snapshots (account_id, balance, balance_usd, taken_on, created_at)
values ('38f9cf68-fb62-4da3-b4f6-6627e40ba72c', 1500, 0, '2026-10-23', '2026-10-24 00:37:39.466+00')
on conflict (account_id, taken_on) do nothing;
insert into public.balance_snapshots (account_id, balance, balance_usd, taken_on, created_at)
select id, 0, 0, '2026-10-01', '2026-10-01 06:00:00+00' from public.accounts
where kind = 'credit_card' and parent_account_id is null and space_id <> '71150d11-94c1-4114-9b8c-ec14bed697ed'
on conflict (account_id, taken_on) do nothing;

-- The space-wide weekly card payment becomes the early payments of Simbiosis' card, every Friday from its debit account.
insert into public.recurring (space_id, kind, amount, currency, account_id, to_account_id, merchant, frequency, next_due, method, auto, variable, purpose, last_paid_on, day_of_month)
select '71150d11-94c1-4114-9b8c-ec14bed697ed', 'transfer', 180345.80, 'CRC', '35f2ecac-f10a-4f99-8df4-4fd0913a67be', '38f9cf68-fb62-4da3-b4f6-6627e40ba72c',
       'Pago anticipado', 'weekly', '2026-10-30', 'transfer', false, true, 'card_early', '2026-10-23', 1
where not exists (select 1 from public.recurring where purpose = 'card_early' and to_account_id = '38f9cf68-fb62-4da3-b4f6-6627e40ba72c');
update public.spaces set card_weekly = false where card_weekly;
