-- PRM-11: a category limit can also warn by week. Each week gets the limit / 4.3, and what's left rolls into the next:
-- by the current week (weeks of the space that touch the month, counted from the first) it may have spent k × limit / 4.3.
alter table public.envelopes add column if not exists weekly_alert boolean not null default false;

create or replace function public.check_limit_alert()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare e record; s record; today date; d date; p_from date; p_to date; spent numeric; pct numeric; cap numeric;
  who text; fx numeric; ws date; w0 date; k int; allowed numeric;
begin
  if new.kind not in ('expense', 'refund', 'transfer') or new.category_id is null or new.hold is not null then return null; end if;
  select * into s from public.spaces where id = new.space_id;
  today := (now() at time zone 'America/Costa_Rica')::date;
  d := (new.occurred_at at time zone 'America/Costa_Rica')::date;
  p_from := date_trunc('month', today)::date; p_to := (p_from + interval '1 month')::date;
  if d < p_from or d >= p_to then return null; end if;
  select crc_per_usd into fx from public.fx_rates order by rate_date desc limit 1;
  who := case when s.kind = 'shared' then 'Llevan' else 'Llevás' end;

  -- every limit this movement counts in: its category's and its parent's
  for e in
    select en.* from public.envelopes en
    join public.envelope_categories ec on ec.envelope_id = en.id
    join public.categories c on c.id = new.category_id
    where ec.category_id in (c.id, c.parent_id) and en.kind = 'cap' and en.active and not en.is_rest and en.amount is not null
  loop
    cap := case when e.currency = 'USD' then e.amount * coalesce(fx, 500) else e.amount end;
    select coalesce(sum(case when t.kind = 'refund' then -t.amount_crc else t.amount_crc end), 0) into spent
    from public.transactions t
    join public.categories c on c.id = t.category_id
    where t.space_id = new.space_id
      and t.kind in ('expense', 'refund', 'transfer') and t.hold is null
      and t.recurring_id is null
      and exists (select 1 from public.envelope_categories ec where ec.envelope_id = e.id and ec.category_id in (c.id, c.parent_id))
      and t.occurred_at >= (p_from::timestamp at time zone 'America/Costa_Rica')
      and t.occurred_at < (p_to::timestamp at time zone 'America/Costa_Rica');
    pct := spent / cap * 100;
    if pct >= 100 then
      insert into public.notification_log (space_id, key) values (s.id, 'env80:' || e.id || ':' || p_from) on conflict do nothing;
      perform public.notify_space(s.id, 'env100:' || e.id || ':' || p_from, 'limits',
        case when s.kind = 'shared' then 'Se pasaron en ' else 'Te pasaste en ' end || e.name,
        who || ' ' || public.crc_text(spent) || ' de ' || public.crc_text(cap) || ' este mes (' || public.crc_text(spent - cap) || ' de más).',
        '/#/categorias');
      continue;
    end if;
    if pct >= 80 then
      perform public.notify_space(s.id, 'env80:' || e.id || ':' || p_from, 'limits',
        e.name || ' al ' || floor(pct)::int || '%',
        who || ' ' || public.crc_text(spent) || ' de ' || public.crc_text(cap) || ' este mes. Quedan ' || public.crc_text(cap - spent) || '.',
        '/#/categorias');
    end if;
    if e.weekly_alert and d >= today - ((extract(dow from today)::int - coalesce(s.week_start, 1) + 7) % 7) then
      ws := today - ((extract(dow from today)::int - coalesce(s.week_start, 1) + 7) % 7);
      -- the week of the 1st counts on its own only with 4 or more days of the month; a shorter one joins the next
      w0 := p_from - ((extract(dow from p_from)::int - coalesce(s.week_start, 1) + 7) % 7);
      if (p_from - w0) > 3 then w0 := w0 + 7; end if;
      k := greatest(1, ((ws - w0) / 7) + 1);
      allowed := least(cap, cap * k / 4.3);
      if spent > allowed then
        perform public.notify_space(s.id, 'envw:' || e.id || ':' || ws, 'limits',
          case when s.kind = 'shared' then 'Se pasaron esta semana en ' else 'Te pasaste esta semana en ' end || e.name,
          who || ' ' || public.crc_text(spent) || ' este mes y hasta esta semana tocaban ' || public.crc_text(allowed) || ' (' || public.crc_text(spent - allowed) || ' de más).',
          '/#/categorias');
      end if;
    end if;
  end loop;
  return null;
end $function$;
