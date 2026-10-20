-- Card holds (preautorizaciones). Uber and Didi authorize an estimate before the ride and BAC emails
-- that authorization as if it were a purchase. If the ride is cancelled the money is never charged,
-- so those vouchers come in as `hold = 'pending'` and don't count until they settle.
--   hold null      -> normal movement, counts everywhere
--   hold pending   -> authorization only, excluded from totals, budgets and alerts
--   hold void      -> never charged (cancelled), kept for the record, excluded everywhere
-- Pending holds settle on their own after 48 hours unless someone marks them "No se cobró".

alter table public.transactions
  add column if not exists hold text check (hold in ('pending', 'void')),
  add column if not exists hold_resolved_at timestamptz;

create index if not exists transactions_pending_holds on public.transactions (occurred_at) where hold = 'pending';

-- Merchants that authorize before charging (rides and delivery). Memberships are plain charges.
create or replace function public.is_hold_merchant(p text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(
    upper(p) ~ '(UBER|DIDI|DDMX|^UE[ *]|^UB EATS)' and upper(p) !~ 'MEMBERSHIP|UBER ONE',
    false);
$$;

create or replace function public.ingest_bac_voucher(
  p_token text, p_message_id text, p_last4 text, p_merchant text, p_amount numeric,
  p_currency text, p_occurred_at timestamptz, p_tx_type text default 'COMPRA', p_auth text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare u uuid; acc record; k text; cat uuid; fx numeric; n integer;
begin
  u := public.token_user(p_token);
  if p_amount is null or p_amount <= 0 then return 'skipped_zero'; end if;
  if p_currency not in ('CRC','USD') then return 'skipped_currency'; end if;

  select a.* into acc from public.accounts a
  join public.space_members m on m.space_id = a.space_id and m.user_id = u
  where a.last4 = p_last4 and not a.archived limit 1;

  if acc is null then
    insert into public.ingest_unmatched (user_id, payload, reason)
    values (u, jsonb_build_object('message_id',p_message_id,'last4',p_last4,'merchant',p_merchant,'amount',p_amount,'currency',p_currency,'occurred_at',p_occurred_at,'type',p_tx_type), 'no_account_for_card');
    return 'unmatched';
  end if;

  k := case when upper(coalesce(p_tx_type,'')) ~ '(DEVOL|REVERS|ANUL|CREDITO|REEMBOLSO)' then 'refund' else 'expense' end;
  fx := case when p_currency = 'USD' then public.current_fx((p_occurred_at at time zone 'America/Costa_Rica')::date) else 1 end;
  cat := public.match_category(acc.space_id, p_merchant);

  insert into public.transactions (space_id, kind, amount, currency, fx_rate, occurred_at, merchant, raw_merchant,
    category_id, account_id, status, source, external_id, note, hold)
  values (acc.space_id, k, p_amount, p_currency, fx, p_occurred_at, public.pretty_merchant(p_merchant), p_merchant,
    cat, acc.id, case when cat is null then 'review' else 'posted' end, 'email', p_message_id,
    case when p_auth is not null then 'Autorización ' || p_auth end,
    case when k = 'expense' and public.is_hold_merchant(p_merchant) then 'pending' end)
  on conflict (space_id, source, external_id) where external_id is not null do nothing;
  get diagnostics n = row_count;
  return case when n = 0 then 'duplicate' else 'inserted' end;
end $$;

-- Pending holds older than 48 hours are taken as charged.
create or replace function public.settle_holds() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.transactions set hold = null, hold_resolved_at = now()
  where hold = 'pending' and occurred_at < now() - interval '48 hours';
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.settle_holds() from public, anon, authenticated;
select cron.schedule('settle-holds', '7 * * * *', 'select public.settle_holds()');

-- Limit alerts ignore holds, and run again when a hold settles.
create or replace function public.check_limit_alert() returns trigger language plpgsql security definer set search_path = public as $$
declare c record; s record; today date; d date; p_from date; p_to date; spent numeric; pct numeric;
  who text; label text; back integer; cid uuid;
begin
  if new.kind not in ('expense', 'refund') or new.category_id is null or new.hold is not null then return null; end if;
  select coalesce(parent_id, id) into cid from public.categories where id = new.category_id;
  select * into c from public.categories where id = cid;  -- limits live in the parent category
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
  if d < p_from or d >= p_to then return null; end if;

  select coalesce(sum(case when kind = 'expense' then amount_crc else -amount_crc end), 0) into spent
  from public.transactions
  where category_id in (select id from public.categories where id = c.id or parent_id = c.id)
    and kind in ('expense', 'refund')
    and hold is null
    and occurred_at >= (p_from::timestamp at time zone 'America/Costa_Rica')
    and occurred_at < (p_to::timestamp at time zone 'America/Costa_Rica');
  pct := spent / c.limit_amount * 100;
  who := case when s.kind = 'shared' then 'Llevan' else 'Llevás' end;

  if pct >= 100 then
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

drop trigger if exists transactions_limit_alert on public.transactions;
create trigger transactions_limit_alert after insert or update of category_id, amount, hold on public.transactions
  for each row execute function public.check_limit_alert();

-- Friday reminder: settled charges, plus a note for holds still pending (they usually get charged).
create or replace function public.card_payment_reminders() returns integer language plpgsql security definer set search_path = public as $$
declare s record; today date; back integer; w_from date; total numeric; pend numeric; sent integer := 0; debit text;
begin
  today := (now() at time zone 'America/Costa_Rica')::date;
  for s in select * from public.spaces where kind = 'shared' loop
    back := (extract(dow from today)::int - s.week_start + 7) % 7;
    if back <> 0 then continue; end if;
    w_from := today - 7;
    select coalesce(sum(case when t.hold is null and t.kind = 'expense' then t.amount_crc when t.hold is null and t.kind = 'refund' then -t.amount_crc else 0 end), 0),
           coalesce(sum(case when t.hold = 'pending' and t.kind = 'expense' then t.amount_crc else 0 end), 0)
      into total, pend
    from public.transactions t join public.accounts a on a.id = t.account_id and a.kind = 'credit_card'
    where t.space_id = s.id
      and t.occurred_at >= (w_from::timestamp at time zone 'America/Costa_Rica')
      and t.occurred_at < (today::timestamp at time zone 'America/Costa_Rica');
    if total <= 0 and pend <= 0 then continue; end if;
    if exists (select 1 from public.transactions where space_id = s.id and external_id = 'card-week:' || w_from) then continue; end if;
    select name into debit from public.accounts where space_id = s.id and kind = 'debit' and not archived limit 1;
    if public.notify_space(s.id, 'card:' || w_from, 'card',
         '💳 Hoy toca pagar la tarjeta',
         public.crc_text(total) || ' de la semana del ' || extract(day from w_from) || ' al ' || extract(day from today - 1) || coalesce(', desde ' || debit, '') ||
         case when pend > 0 then ' (+ ' || public.crc_text(pend) || ' pendiente)' else '' end || '.',
         '/#/') then
      sent := sent + 1;
    end if;
  end loop;
  return sent;
end $$;
revoke execute on function public.card_payment_reminders() from public, anon, authenticated;

-- Data (applied once, 2026-10-19): Uber/Didi vouchers from the last 48 hours were marked pending.
