-- Subcategories: one level below a category. Budgets and limits live on the parent;
-- spend in a subcategory counts toward its parent everywhere (app, limit alerts, AI insight).

alter table public.categories add column if not exists parent_id uuid references public.categories(id) on delete set null;
create index if not exists categories_parent on public.categories(parent_id);

create or replace function public.check_category_parent() returns trigger
language plpgsql set search_path = public as $$
declare p record;
begin
  if new.parent_id is null then return new; end if;
  if new.parent_id = new.id then raise exception 'Una categoría no puede ser subcategoría de sí misma'; end if;
  select * into p from public.categories where id = new.parent_id;
  if p is null or p.space_id <> new.space_id then raise exception 'La categoría madre debe ser del mismo espacio'; end if;
  if p.parent_id is not null then raise exception 'Solo hay un nivel de subcategorías'; end if;
  if p.kind <> new.kind then raise exception 'La categoría madre debe ser del mismo tipo'; end if;
  if exists (select 1 from public.categories where parent_id = new.id) then raise exception 'Esta categoría tiene subcategorías, no puede ser subcategoría'; end if;
  new.limit_amount := null; new.limit_period := null; new.is_fixed := false; -- the budget lives in the parent
  return new;
end $$;

drop trigger if exists categories_parent_check on public.categories;
create trigger categories_parent_check before insert or update of parent_id, limit_amount, limit_period, is_fixed on public.categories
  for each row execute function public.check_category_parent();

-- Limit alerts resolve the parent and add up the whole family.
create or replace function public.check_limit_alert() returns trigger language plpgsql security definer set search_path = public as $$
declare c record; s record; today date; d date; p_from date; p_to date; spent numeric; pct numeric;
  who text; label text; back integer; cid uuid;
begin
  if new.kind not in ('expense', 'refund') or new.category_id is null then return null; end if;
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

-- Data (applied once, 2026-10-17): new "Salidas" parents in Simbiosis and Personal with
-- Restaurantes, Bares, Café and Cine y eventos (formerly Entretenimiento); Delivery stays its own category.
-- History was then sorted into subcategories by the categorize function in "refine" mode.
