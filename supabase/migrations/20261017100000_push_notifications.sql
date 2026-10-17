-- Push notifications: budget limits at 80% / 100% and the Friday card payment.
-- Keys live in app_secrets (inserted separately, never committed). Only the service role can read it.

create table if not exists public.app_secrets (
  key text primary key,
  value text not null
);
alter table public.app_secrets enable row level security; -- no policies: invisible to anon/authenticated
revoke all on public.app_secrets from anon, authenticated;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "own subscriptions" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.push_subscriptions to authenticated;

alter table public.profiles
  add column if not exists notify_limits boolean not null default true,
  add column if not exists notify_card boolean not null default true;

-- One row per notification ever sent, so the same alert never goes out twice.
create table if not exists public.notification_log (
  space_id uuid not null references public.spaces on delete cascade,
  key text not null,
  created_at timestamptz not null default now(),
  primary key (space_id, key)
);
alter table public.notification_log enable row level security;
revoke all on public.notification_log from anon, authenticated;

-- The app needs the public key to subscribe.
create or replace function public.vapid_public_key() returns text
language sql stable security definer set search_path = public as $$
  select value from public.app_secrets where key = 'vapid_public';
$$;
grant execute on function public.vapid_public_key() to authenticated;

create or replace function public.crc_text(v numeric) returns text language sql immutable as $$
  select '₡' || replace(to_char(round(v), 'FM999,999,999,999'), ',', '.');
$$;

-- Sends once per (space, key) through the notify Edge Function.
create or replace function public.notify_space(p_space uuid, p_key text, p_kind text, p_title text, p_body text, p_url text default '/#/')
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.notification_log (space_id, key) values (p_space, p_key) on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then return false; end if;
  perform net.http_post(
    'https://vzgnujopgryuskixcnnx.supabase.co/functions/v1/notify',
    jsonb_build_object('space_id', p_space, 'kind', p_kind, 'title', p_title, 'body', p_body, 'url', p_url),
    '{}'::jsonb,
    jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', (select value from public.app_secrets where key = 'notify_secret')),
    10000);
  return true;
end $$;
revoke execute on function public.notify_space(uuid, text, text, text, text, text) from public, anon, authenticated;

-- After a spend lands in a category with a limit, alert at 80% and 100% of the current period.
create or replace function public.check_limit_alert() returns trigger language plpgsql security definer set search_path = public as $$
declare c record; s record; today date; d date; p_from date; p_to date; spent numeric; pct numeric;
  who text; label text; back integer;
begin
  if new.kind not in ('expense', 'refund') or new.category_id is null then return null; end if;
  select * into c from public.categories where id = new.category_id;
  if c is null or c.limit_amount is null or c.limit_amount <= 0 or c.is_fixed then return null; end if;
  select * into s from public.spaces where id = new.space_id;
  today := (now() at time zone 'America/Costa_Rica')::date;
  d := (new.occurred_at at time zone 'America/Costa_Rica')::date;
  if c.limit_period = 'weekly' then
    back := (extract(dow from today)::int - s.week_start + 7) % 7;
    p_from := today - back; p_to := p_from + 7; label := 'esta semana';
  else
    p_from := date_trunc('month', today)::date; p_to := (p_from + interval '1 month')::date; label := 'este mes';
  end if;
  if d < p_from or d >= p_to then return null; end if; -- old imports never alert

  select coalesce(sum(case when kind = 'expense' then amount_crc else -amount_crc end), 0) into spent
  from public.transactions
  where category_id = c.id and kind in ('expense', 'refund')
    and occurred_at >= (p_from::timestamp at time zone 'America/Costa_Rica')
    and occurred_at < (p_to::timestamp at time zone 'America/Costa_Rica');
  pct := spent / c.limit_amount * 100;
  who := case when s.kind = 'shared' then 'Llevan' else 'Llevás' end;

  if pct >= 100 then
    -- past 100% the 80% warning is moot; mark it as done so it never arrives late
    insert into public.notification_log (space_id, key) values (s.id, 'limit80:' || c.id || ':' || p_from) on conflict do nothing;
    perform public.notify_space(s.id, 'limit100:' || c.id || ':' || p_from, 'limits',
      case when s.kind = 'shared' then '🚨 Se pasaron en ' else '🚨 Te pasaste en ' end || c.emoji || ' ' || c.name,
      who || ' ' || public.crc_text(spent) || ' de ' || public.crc_text(c.limit_amount) || ' ' || label || ' (' || public.crc_text(spent - c.limit_amount) || ' de más).',
      '/#/categoria/' || c.id);
  elsif pct >= 80 then
    perform public.notify_space(s.id, 'limit80:' || c.id || ':' || p_from, 'limits',
      '⚠️ ' || c.emoji || ' ' || c.name || ' al ' || floor(pct)::int || '%',
      who || ' ' || public.crc_text(spent) || ' de ' || public.crc_text(c.limit_amount) || ' ' || label || '. Quedan ' || public.crc_text(c.limit_amount - spent) || '.',
      '/#/categoria/' || c.id);
  end if;
  return null;
end $$;

create trigger transactions_limit_alert after insert or update of category_id, amount on public.transactions
  for each row execute function public.check_limit_alert();

-- Every morning: on the first day of a shared space's week, remind to pay last week's card charges.
create or replace function public.card_payment_reminders() returns integer language plpgsql security definer set search_path = public as $$
declare s record; today date; back integer; w_from date; total numeric; sent integer := 0; debit text;
begin
  today := (now() at time zone 'America/Costa_Rica')::date;
  for s in select * from public.spaces where kind = 'shared' loop
    back := (extract(dow from today)::int - s.week_start + 7) % 7;
    if back <> 0 then continue; end if;
    w_from := today - 7;
    select coalesce(sum(case when t.kind = 'expense' then t.amount_crc when t.kind = 'refund' then -t.amount_crc else 0 end), 0) into total
    from public.transactions t join public.accounts a on a.id = t.account_id and a.kind = 'credit_card'
    where t.space_id = s.id
      and t.occurred_at >= (w_from::timestamp at time zone 'America/Costa_Rica')
      and t.occurred_at < (today::timestamp at time zone 'America/Costa_Rica');
    if total <= 0 then continue; end if;
    if exists (select 1 from public.transactions where space_id = s.id and external_id = 'card-week:' || w_from) then continue; end if;
    select name into debit from public.accounts where space_id = s.id and kind = 'debit' and not archived limit 1;
    if public.notify_space(s.id, 'card:' || w_from, 'card',
         '💳 Hoy toca pagar la tarjeta',
         public.crc_text(total) || ' de la semana del ' || extract(day from w_from) || ' al ' || extract(day from today - 1) || coalesce(', desde ' || debit, '') || '.',
         '/#/') then
      sent := sent + 1;
    end if;
  end loop;
  return sent;
end $$;
revoke execute on function public.card_payment_reminders() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('card-payment-reminders', '0 14 * * *', 'select public.card_payment_reminders()'); -- 8:00 Costa Rica
