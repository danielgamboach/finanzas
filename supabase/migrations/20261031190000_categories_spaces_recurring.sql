-- Categoría siempre asignada, espacios para cualquiera, recurrentes y abandonar espacios
-- (docs/comportamiento: MOV-04, PRI-01, REC-01, REC-02, REC-07, REC-08, ESP-01, ESP-03, ESP-04, ESP-05).

-- check_tx_refs creates the space's cash account when needed: it runs as the owner
alter function public.check_tx_refs() security definer;

-- MOV-04: every expense and income ends up with a category -------------------------------------
create or replace function public.fallback_category(p_space uuid, p_kind text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.categories
  where space_id = p_space and not archived and parent_id is null
    and kind = case when p_kind = 'income' then 'income' else 'expense' end
  order by (lower(name) in ('otros', 'otro ingreso', 'otro', 'otros gastos'))::int desc, sort desc
  limit 1
$$;
revoke execute on function public.fallback_category(uuid, text) from public, anon, authenticated;

-- Once the AI has looked at a movement it couldn't place with confidence, it keeps the suggestion as its
-- category (or the space's "Otros"), still "Por revisar".
create or replace function public.ai_category_fallback() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.category_id is null and new.kind in ('expense', 'income', 'refund')
     and new.ai_checked_at is not null and old.ai_checked_at is null then
    new.category_id := coalesce(new.suggested_category_id, public.fallback_category(new.space_id, new.kind));
    if new.category_id is not null then
      new.status := 'review';
      new.category_source := case when new.suggested_category_id is not null then 'ai' else 'auto' end;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists transactions_ai_fallback on public.transactions;
create trigger transactions_ai_fallback before update on public.transactions
  for each row execute function public.ai_category_fallback();

alter table public.transactions disable trigger transactions_limit_alert;
update public.transactions set
  category_id = coalesce(suggested_category_id, public.fallback_category(space_id, kind)),
  status = 'review',
  category_source = case when suggested_category_id is not null then 'ai' else 'auto' end
where category_id is null and kind in ('expense', 'income', 'refund') and ai_checked_at is not null;
alter table public.transactions enable trigger transactions_limit_alert;

-- PRI-01: nothing that only fits Dani and Kimmy ---------------------------------------------------
-- The weekly card payment is a setting of each space (on for the spaces that already used it).
alter table public.spaces add column if not exists card_weekly boolean not null default false;
update public.spaces set card_weekly = true where kind = 'shared';
-- Weeks start on Monday unless a space says otherwise.
alter table public.spaces alter column week_start set default 1;

create or replace function public.card_payment_reminders()
 returns integer language plpgsql security definer set search_path to 'public' as $function$
declare s record; today date; back integer; w_from date; total numeric; pend numeric; sent integer := 0; debit text;
begin
  today := (now() at time zone 'America/Costa_Rica')::date;
  for s in select * from public.spaces where card_weekly loop
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
end $function$;

-- Generic home categories for new shared spaces ("Hogar" instead of "Casita").
create or replace function public.seed_space_defaults(p_space uuid, p_kind text)
 returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if p_kind = 'shared' then
    insert into public.categories (space_id, name, emoji, color, kind, is_fixed, sort) values
      (p_space,'Súper','🛒','mint','expense',false,1),
      (p_space,'Restaurantes','🍽️','peach','expense',false,2),
      (p_space,'Delivery','🛵','pink','expense',false,3),
      (p_space,'Transporte','🚕','sky','expense',false,4),
      (p_space,'Gasolina','⛽','butter','expense',false,5),
      (p_space,'Hogar','🪴','lilac','expense',false,6),
      (p_space,'Alquiler','🔑','gray','expense',true,7),
      (p_space,'Servicios','💡','butter','expense',true,8),
      (p_space,'Entretenimiento','🎬','lilac','expense',false,9),
      (p_space,'Salud','💊','pink','expense',false,10),
      (p_space,'Suscripciones','📺','pink','expense',true,11),
      (p_space,'Otros','✨','gray','expense',false,12),
      (p_space,'Otro ingreso','💰','mint','income',false,20);
  else
    insert into public.categories (space_id, name, emoji, color, kind, is_fixed, sort) values
      (p_space,'Súper','🛒','mint','expense',false,1),
      (p_space,'Restaurantes','🍽️','peach','expense',false,2),
      (p_space,'Salidas','☕','peach','expense',false,3),
      (p_space,'Transporte','🚕','sky','expense',false,4),
      (p_space,'Ropa','👕','lilac','expense',false,5),
      (p_space,'Salud','💊','pink','expense',false,6),
      (p_space,'Suscripciones','📺','pink','expense',true,7),
      (p_space,'Entretenimiento','🎬','lilac','expense',false,8),
      (p_space,'Otros','✨','gray','expense',false,9),
      (p_space,'Salario','💼','mint','income',false,20),
      (p_space,'Freelance','💻','sky','income',false,21),
      (p_space,'Reintegro','↩️','butter','income',false,22),
      (p_space,'Otro ingreso','💰','mint','income',false,23);
  end if;

  insert into public.merchant_rules (space_id, pattern, category_id, priority)
  select p_space, r.pattern, c.id, r.priority
  from (values
    ('AUTO MERCADO','Súper',10),('FRESH MARKET','Súper',10),('MXM','Súper',10),('MAS X MENOS','Súper',10),
    ('WALMART','Súper',10),('MAXI PALI','Súper',10),('PALI','Súper',5),('GESSA','Súper',10),('SARETTO','Súper',10),
    ('PRICESMART','Súper',10),('MINISUPER','Súper',5),('MINI SUPER','Súper',5),('FM SJ','Súper',5),
    ('UE COSTA RICA','Delivery',20),('UBER EATS','Delivery',20),('RAPPI','Delivery',15),('DIDI FOOD','Delivery',15),
    ('UBER','Transporte',10),('DIDI','Transporte',5),
    ('DELTA','Gasolina',10),('SERVICENTRO','Gasolina',10),('GASOLINERA','Gasolina',10),('UNO ','Gasolina',2),
    ('FERRETERIA','Hogar',10),('EPA','Hogar',8),('PEQUENO MUNDO','Hogar',10),('ALISS','Hogar',10),('IKEA','Hogar',10),
    ('CINE','Entretenimiento',10),('SALA GARBO','Entretenimiento',10),('TEATRO','Entretenimiento',5),('ESPACIO ESCENIC','Entretenimiento',10),
    ('FARMACIA','Salud',10),('FISCHEL','Salud',10),('SUCRE','Salud',10),
    ('APPLE.COM','Suscripciones',10),('NETFLIX','Suscripciones',10),('SPOTIFY','Suscripciones',10),('DISNEY','Suscripciones',10),
    ('CNFL','Servicios',10),('AYA','Servicios',5),('KOLBI','Servicios',10),('LIBERTY','Servicios',10),('TIGO','Servicios',10)
  ) as r(pattern, cat_name, priority)
  join public.categories c on c.space_id = p_space and c.name = r.cat_name
  on conflict do nothing;
end $function$;

-- ESP: the personal space stays; a shared space is deleted when its last member leaves ------------
create or replace function public.protect_spaces() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if coalesce(current_setting('finanzas.space_delete', true), '') <> '1' then
      raise exception 'Un espacio se borra cuando lo abandona la última persona';
    end if;
    return old;
  end if;
  new.kind := old.kind;
  return new;
end $$;
drop trigger if exists spaces_protect on public.spaces;
create trigger spaces_protect before update or delete on public.spaces for each row execute function public.protect_spaces();

create or replace function public.leave_space(p_space uuid) returns text
language plpgsql security definer set search_path = public as $$
declare s record; remaining integer; next_owner uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into s from public.spaces where id = p_space;
  if s.id is null or not exists (select 1 from public.space_members where space_id = p_space and user_id = auth.uid()) then
    raise exception 'not a member';
  end if;
  if s.kind = 'personal' then raise exception 'El espacio personal no se puede abandonar'; end if;

  delete from public.space_members where space_id = p_space and user_id = auth.uid();
  select count(*) into remaining from public.space_members where space_id = p_space;
  if remaining = 0 then
    -- the last one out: the space and everything in it are deleted now, for good
    perform set_config('finanzas.space_delete', '1', true);
    delete from public.spaces where id = p_space;
    perform set_config('finanzas.space_delete', '', true);
    return 'deleted';
  end if;
  if not exists (select 1 from public.space_members where space_id = p_space and role = 'owner') then
    select user_id into next_owner from public.space_members where space_id = p_space order by created_at limit 1;
    update public.space_members set role = 'owner' where space_id = p_space and user_id = next_owner;
  end if;
  return 'left';
end $$;
revoke execute on function public.leave_space(uuid) from public, anon;
grant execute on function public.leave_space(uuid) to authenticated;

-- A transfer whose destination was deleted (its space was deleted) keeps its origin.
create or replace function public.check_tx_refs() returns trigger
language plpgsql security definer set search_path = public as $$
declare src text; dst record; touched boolean;
begin
  if new.kind = 'contribution' then new.kind := 'transfer'; end if;
  if new.category_id is not null and not exists (select 1 from public.categories c where c.id = new.category_id and c.space_id = new.space_id) then
    raise exception 'category does not belong to space';
  end if;
  if new.account_id is null then new.account_id := public.cash_account(new.space_id); end if;
  select kind into src from public.accounts a where a.id = new.account_id and a.space_id = new.space_id;
  if src is null then raise exception 'account does not belong to space'; end if;

  if new.kind = 'transfer' then
    if new.to_account_id is null then
      if not (tg_op = 'UPDATE' and old.to_account_id is not null) then raise exception 'Elegí a qué cuenta va el dinero'; end if;
      new.to_space_id := null;
    else
      select id, space_id, kind into dst from public.accounts where id = new.to_account_id;
      if dst.id is null then raise exception 'destination account not found'; end if;
      if new.to_account_id = new.account_id then raise exception 'La cuenta de origen y la de destino son la misma'; end if;
      if dst.space_id <> new.space_id and auth.uid() is not null and not public.is_space_member(dst.space_id) then
        raise exception 'destination account not available';
      end if;
      new.to_space_id := case when dst.space_id <> new.space_id then dst.space_id end;
    end if;
  else
    new.to_account_id := null;
    new.to_space_id := null;
  end if;

  touched := tg_op = 'INSERT' or new.kind is distinct from old.kind or new.account_id is distinct from old.account_id
    or new.to_account_id is distinct from old.to_account_id;
  if touched then
    if new.kind = 'expense' and src in ('cdp', 'investment', 'loan') then raise exception 'Esta cuenta no sirve para pagar gastos'; end if;
    if new.kind = 'refund' and src in ('cdp', 'investment', 'loan') then raise exception 'Esta cuenta no recibe devoluciones'; end if;
    if new.kind = 'income' and src in ('credit_card', 'loan') then raise exception 'Esta cuenta no recibe ingresos'; end if;
    if new.kind = 'transfer' and src in ('credit_card', 'loan') then raise exception 'De esta cuenta no puede salir dinero'; end if;
  end if;

  if new.currency = 'CRC' then new.fx_rate := 1; end if;
  return new;
end $$;

-- REC: automatic or manual, custom periods, postponing, transfers -------------------------------
alter table public.recurring add column if not exists auto boolean;
update public.recurring set auto = (method = 'card') where auto is null;
alter table public.recurring alter column auto set default false;
alter table public.recurring alter column auto set not null;
alter table public.recurring add column if not exists snooze_until date;
alter table public.recurring add column if not exists to_account_id uuid references public.accounts(id) on delete set null;

create or replace function public.add_period(d date, f text, n integer, u text) returns date
language sql immutable set search_path = public as $$
  select case when f = 'custom' and n is not null then
    case u when 'day' then d + n when 'week' then d + 7 * n else (d + make_interval(months => n))::date end
  else public.add_period(d, f) end
$$;
create or replace function public.period_days(f text, n integer, u text) returns integer
language sql immutable set search_path = public as $$
  select case when f = 'custom' and n is not null then
    case u when 'day' then n when 'week' then 7 * n else 30 * n end
  else public.period_days(f) end
$$;

create or replace function public.advance_recurring()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare r record; d date; lead integer; nd date;
begin
  if new.recurring_id is null then return null; end if;
  select * into r from public.recurring where id = new.recurring_id;
  if r is null then return null; end if;
  d := (new.occurred_at at time zone 'America/Costa_Rica')::date;
  lead := least(10, greatest(2, public.period_days(r.frequency, r.every_n, r.every_unit) / 3));
  nd := r.next_due;
  while nd <= d + lead loop
    nd := public.add_period(nd, r.frequency, r.every_n, r.every_unit);
  end loop;
  update public.recurring set next_due = nd, snooze_until = null,
    last_paid_on = greatest(coalesce(last_paid_on, d), d) where id = r.id;
  return null;
end $function$;

-- A voucher that matches a recurrent also replaces the charge registered without it (REC-08).
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
    lead := least(10, greatest(2, public.period_days(r.frequency, r.every_n, r.every_unit) / 3));
    expected := r.amount * case when r.currency = 'USD' then public.current_fx(d) else 1 end;
    if (r.variable or amt between expected * 0.65 and expected * 1.35) and (
         d between r.next_due - lead and r.next_due + greatest(lead, least(31, public.period_days(r.frequency, r.every_n, r.every_unit)))
         or exists (select 1 from public.transactions p where p.recurring_id = r.id and p.auto_flag = 'no_voucher'
                    and abs((p.occurred_at at time zone 'America/Costa_Rica')::date - d) <= lead)) then
      new.recurring_id := r.id;
      if new.category_id is null and r.category_id is not null then
        new.category_id := r.category_id;
        new.status := 'posted';
        new.category_source := 'auto';
      end if;
      delete from public.transactions p where p.recurring_id = r.id and p.auto_flag = 'no_voucher'
        and abs((p.occurred_at at time zone 'America/Costa_Rica')::date - d) <= lead;
      return new;
    end if;
  end loop;
  return new;
end $function$;

create or replace function public.link_recurring(p_tx uuid)
 returns void language plpgsql security definer set search_path to 'public' as $function$
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
    lead := least(10, greatest(2, public.period_days(r.frequency, r.every_n, r.every_unit) / 3));
    expected := r.amount * case when r.currency = 'USD' then public.current_fx(d) else 1 end;
    if d between r.next_due - lead and r.next_due + greatest(lead, least(31, public.period_days(r.frequency, r.every_n, r.every_unit)))
       and (r.variable or amt between expected * 0.65 and expected * 1.35) then
      update public.transactions set recurring_id = r.id where id = t.id;
      nd := r.next_due;
      while nd <= d + lead loop nd := public.add_period(nd, r.frequency, r.every_n, r.every_unit); end loop;
      update public.recurring set next_due = nd, snooze_until = null, last_paid_on = greatest(coalesce(last_paid_on, d), d) where id = r.id;
      return;
    end if;
  end loop;
end $function$;

-- REC-08: automatic charges get registered on their own ----------------------------------------
alter table public.transactions add column if not exists auto_flag text;
alter table public.transactions add constraint transactions_auto_flag_check check (auto_flag is null or auto_flag = 'no_voucher');

-- On the charge day, an automatic recurrent becomes a movement in its account. When that account gets
-- bank vouchers, it waits for the voucher until the next day; then it registers the expected amount with a
-- warning (auto_flag = 'no_voucher'), which the voucher replaces if it arrives later (match_recurring).
-- Only the last two days count: older overdue ones stay as they are, for the person to decide.
create or replace function public.run_auto_recurring() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; today date; acc uuid; vouchers boolean; n integer := 0; cat uuid;
begin
  today := (now() at time zone 'America/Costa_Rica')::date;
  for r in
    select * from public.recurring
    where active and auto and next_due between today - 2 and today
      and (snooze_until is null or snooze_until <= today)
  loop
    begin
      acc := coalesce(r.account_id, public.cash_account(r.space_id));
      vouchers := exists (select 1 from public.transactions
        where account_id = acc and source = 'email' and occurred_at > now() - interval '30 days');
      if vouchers and r.next_due >= today then continue; end if;
      if r.kind = 'transfer' and r.to_account_id is null then continue; end if;
      cat := case when r.kind in ('expense', 'income') then coalesce(r.category_id, public.fallback_category(r.space_id, r.kind)) end;
      insert into public.transactions (space_id, kind, amount, currency, fx_rate, occurred_at, merchant, category_id,
        account_id, to_account_id, recurring_id, status, source, category_source, auto_flag)
      values (r.space_id, r.kind, r.amount, r.currency,
        case when r.currency = 'USD' then public.current_fx(r.next_due) else 1 end,
        (r.next_due::timestamp + time '08:00') at time zone 'America/Costa_Rica',
        r.merchant, cat, acc, case when r.kind = 'transfer' then r.to_account_id end, r.id, 'posted', 'recurring',
        case when cat is not null then 'auto' end,
        case when vouchers then 'no_voucher' end);
      n := n + 1;
    exception when others then
      raise warning 'run_auto_recurring %: %', r.id, sqlerrm;
    end;
  end loop;
  return n;
end $$;
revoke execute on function public.run_auto_recurring() from public, anon, authenticated;
select cron.schedule('auto-recurring', '15 * * * *', 'select public.run_auto_recurring()');
