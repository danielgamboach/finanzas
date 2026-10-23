-- "No se cobró" removes the movement from the app entirely. The row stays only as a marker, so the
-- same voucher (from either mailbox) is recognized as a duplicate and never comes back. Nothing reads
-- it: the app, Kai and the monthly note all read as the user, and this policy hides it from them.
alter table public.transactions
  add column if not exists visible boolean generated always as (hold is distinct from 'void') stored;

create policy transactions_hide_void on public.transactions as restrictive for select to authenticated
  using (visible);

-- Settle, void or bring back authorizations. Security definer so a voided row can be found again for undo.
create or replace function public.set_holds(p_ids uuid[], p_hold text) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if p_hold is not null and p_hold not in ('pending', 'void') then raise exception 'bad hold'; end if;
  update public.transactions t
     set hold = p_hold,
         hold_resolved_at = case when p_hold = 'pending' then null else now() end
   where t.id = any(p_ids) and t.kind = 'expense'
     and (t.hold is not null or p_hold = 'pending')
     and public.is_space_member(t.space_id);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.set_holds(uuid[], text) from public, anon;
grant execute on function public.set_holds(uuid[], text) to authenticated;
