-- Spend per day (Costa Rica dates) for the Inicio chart. Same rule as spend() in the app:
-- expenses add, refunds subtract, authorizations (hold) don't count until they're charged.
-- Security invoker: RLS decides what the caller sees (membership and hidden voided holds).
create or replace function public.daily_spend(p_space uuid, p_from date, p_to date)
returns table (day date, spend numeric)
language sql stable security invoker set search_path = public as $$
  select (t.occurred_at at time zone 'America/Costa_Rica')::date as day,
         sum(case t.kind when 'expense' then t.amount_crc when 'refund' then -t.amount_crc else 0 end) as spend
    from public.transactions t
   where t.space_id = p_space
     and t.hold is null
     and t.kind in ('expense', 'refund')
     and t.occurred_at >= (p_from::timestamp at time zone 'America/Costa_Rica')
     and t.occurred_at < (p_to::timestamp at time zone 'America/Costa_Rica')
   group by 1
   order by 1
$$;
revoke execute on function public.daily_spend(uuid, date, date) from public, anon;
grant execute on function public.daily_spend(uuid, date, date) to authenticated;
