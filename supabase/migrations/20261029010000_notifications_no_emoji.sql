-- Push notifications without decorative emojis: the category keeps its own emoji, nothing else.
-- Same functions as 20261022230000_card_holds.sql with the titles cleaned.

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
      case when s.kind = 'shared' then 'Se pasaron en ' else 'Te pasaste en ' end || c.emoji || ' ' || c.name,
      who || ' ' || public.crc_text(spent) || ' de ' || public.crc_text(c.limit_amount) || ' ' || label || ' (' || public.crc_text(spent - c.limit_amount) || ' de más).',
      '/#/categoria/' || c.id);
  elsif pct >= 80 then
    perform public.notify_space(s.id, 'limit80:' || c.id || ':' || p_from, 'limits',
      c.emoji || ' ' || c.name || ' al ' || floor(pct)::int || '%',
      who || ' ' || public.crc_text(spent) || ' de ' || public.crc_text(c.limit_amount) || ' ' || label || '. Quedan ' || public.crc_text(c.limit_amount - spent) || '.',
      '/#/categoria/' || c.id);
  end if;
  return null;
end $$;

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
         'Hoy toca pagar la tarjeta',
         public.crc_text(total) || ' de la semana del ' || extract(day from w_from) || ' al ' || extract(day from today - 1) || coalesce(', desde ' || debit, '') ||
         case when pend > 0 then ' (+ ' || public.crc_text(pend) || ' pendiente)' else '' end || '.',
         '/#/') then
      sent := sent + 1;
    end if;
  end loop;
  return sent;
end $$;
