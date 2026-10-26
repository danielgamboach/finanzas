-- Uber and Didi vouchers only wait for approval when they come in a burst: two or more on the same
-- card less than 10 minutes apart (a cancelled request followed by a new one, a fare re-quoted...).
-- A lone ride is a normal charge and counts right away.
--   * Before insert: ingest marks every ride as pending; this clears it when there is no other ride
--     on the card within 10 minutes, or when the voucher is older than 48 hours (history imports).
--   * After insert: a pending ride pulls its neighbours back to pending, so the first voucher of a
--     burst also waits. Only rows nobody has resolved yet (hold_resolved_at null) are touched.

create or replace function public.hold_burst_neighbours(p_id uuid, p_account uuid, p_at timestamptz)
returns setof uuid language sql stable security definer set search_path = public as $$
  select t.id from public.transactions t
  where t.account_id = p_account and t.id <> p_id
    and t.kind = 'expense' and t.hold is distinct from 'void'
    and public.is_hold_merchant(t.raw_merchant)
    and t.occurred_at > p_at - interval '10 minutes'
    and t.occurred_at < p_at + interval '10 minutes';
$$;
revoke execute on function public.hold_burst_neighbours(uuid, uuid, timestamptz) from public, anon, authenticated;

create or replace function public.hold_window_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.hold = 'pending' and (
       new.account_id is null
       or new.occurred_at < now() - interval '48 hours'
       or not exists (select 1 from public.hold_burst_neighbours(new.id, new.account_id, new.occurred_at))
     ) then
    new.hold := null;
  end if;
  return new;
end $$;

create or replace function public.hold_window_pull() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.hold = 'pending' then
    update public.transactions t set hold = 'pending'
    where t.id in (select public.hold_burst_neighbours(new.id, new.account_id, new.occurred_at))
      and t.hold is null and t.hold_resolved_at is null
      and t.occurred_at > now() - interval '48 hours';
  end if;
  return null;
end $$;

create or replace trigger transactions_hold_window before insert on public.transactions
  for each row execute function public.hold_window_check();
create or replace trigger transactions_hold_window_pull after insert on public.transactions
  for each row execute function public.hold_window_pull();
