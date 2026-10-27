-- Undo for answer_subscription. No row is removed here: the answer is retired (its merchant key gets a
-- suffix, so it no longer matches and stays as history), the movements are unlinked and asked again.
-- Returns the recurring payment the answer created, which the app then removes (RLS lets members).

create or replace function public.undo_subscription_answer(p_tx uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare t public.transactions; k text; a public.subscription_answers;
begin
  select * into t from public.transactions where id = p_tx;
  if t.id is null or not public.is_space_member(t.space_id) then raise exception 'not allowed'; end if;
  k := public.sub_key(t.merchant_id, t.raw_merchant, t.merchant);
  select * into a from public.subscription_answers where space_id = t.space_id and merchant = k;
  if a.space_id is null then return null; end if;
  if a.recurring_id is not null then
    update public.transactions set recurring_id = null where recurring_id = a.recurring_id;
  end if;
  update public.subscription_answers set merchant = k || '#undone:' || gen_random_uuid()::text
  where space_id = t.space_id and merchant = k;
  update public.transactions set sub_ask = 'pending'
  where space_id = t.space_id and sub_ask = 'done' and public.sub_key(merchant_id, raw_merchant, merchant) = k
    and occurred_at > now() - interval '45 days';
  return a.recurring_id;
end $$;
revoke all on function public.undo_subscription_answer(uuid) from public, anon;
grant execute on function public.undo_subscription_answer(uuid) to authenticated;
