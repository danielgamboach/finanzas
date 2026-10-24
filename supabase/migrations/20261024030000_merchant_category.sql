-- Changing the category of a merchant moves all of it: every movement of that merchant in the space
-- (all branches when it is in the catalog, otherwise the same bank key or name), categorized or not.
-- Explicit rules (priority >= 50) that only catch this merchant follow along, so new vouchers land in the
-- same place. Returns what it overwrote so the app can undo it.
create or replace function public.set_merchant_category(p_tx uuid, p_category uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t record;
  ckind text;
  ids uuid[];
  tx_before jsonb;
  rules_before jsonb;
begin
  select id, space_id, kind, merchant_id, merchant_key, merchant into t from public.transactions where id = p_tx;
  if t.id is null or not public.is_space_member(t.space_id) then raise exception 'forbidden'; end if;
  select kind into ckind from public.categories where id = p_category and space_id = t.space_id and not archived;
  if ckind is null then raise exception 'category not in space'; end if;

  -- the same merchant, same side of the ledger as the category (expenses and refunds, or income)
  select array_agg(x.id) into ids from public.transactions x
  where x.space_id = t.space_id
    and (case when ckind = 'income' then x.kind = 'income' else x.kind in ('expense', 'refund') end)
    and (
      x.id = t.id
      or (t.merchant_id is not null and x.merchant_id = t.merchant_id)
      or (t.merchant_id is null and x.merchant_id is null and (
            (t.merchant_key is not null and x.merchant_key = t.merchant_key)
         or (t.merchant is not null and x.merchant = t.merchant)))
    );

  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'category_id', x.category_id, 'status', x.status,
           'category_source', x.category_source, 'suggested_category_id', x.suggested_category_id)), '[]'::jsonb)
  into tx_before from public.transactions x
  where x.id = any(ids)
    and (x.category_id is distinct from p_category or x.status = 'review' or x.suggested_category_id is not null);

  update public.transactions x set category_id = p_category, status = 'posted', category_source = 'manual', suggested_category_id = null
  where x.id = any(ids)
    and (x.category_id is distinct from p_category or x.status = 'review' or x.suggested_category_id is not null);

  -- explicit rules that catch this merchant and nothing else now point to the new category
  with hit as (
    select r.id, r.category_id from public.merchant_rules r
    where r.space_id = t.space_id and r.priority >= 50 and r.category_id is distinct from p_category
      and exists (select 1 from public.transactions x where x.id = any(ids)
                  and upper(coalesce(x.raw_merchant, x.merchant, '')) like '%' || upper(r.pattern) || '%')
      and not exists (select 1 from public.transactions y where y.space_id = t.space_id and not (y.id = any(ids))
                  and upper(coalesce(y.raw_merchant, y.merchant, '')) like '%' || upper(r.pattern) || '%')
  ), saved as (
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'category_id', category_id)), '[]'::jsonb) as j from hit
  ), upd as (
    update public.merchant_rules r set category_id = p_category from hit where r.id = hit.id returning r.id
  )
  select j into rules_before from saved, (select count(*) from upd) u;

  return jsonb_build_object('total', coalesce(array_length(ids, 1), 0), 'transactions', tx_before, 'rules', rules_before);
end $$;

revoke execute on function public.set_merchant_category(uuid, uuid) from public, anon;
grant execute on function public.set_merchant_category(uuid, uuid) to authenticated;
