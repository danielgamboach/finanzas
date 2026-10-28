-- Admin view: every merchant without a logo, across all spaces, to fill them in little by little.
-- Catalog merchants with no photo, plus names that aren't in the catalog yet (grouped by their clean
-- name). Bank operations (SINPE, transfers, fees, ATM) are left out: they never get a logo.
-- Only names and counts leave the function, never amounts.
create or replace function public.admin_merchants_without_photo()
returns table (merchant_id uuid, name text, raw text, movements integer, last_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with tx as (
    select t.merchant_id as mid,
           coalesce(nullif(btrim(t.merchant), ''), nullif(btrim(t.raw_merchant), '')) as label,
           t.raw_merchant, t.occurred_at
    from public.transactions t
    where t.kind in ('expense', 'refund')
      and t.visible
      and coalesce(t.raw_merchant, '') !~* '^\s*(cd sinpe|sinpe|comision|tef |atm |valor de tarjeta|db\. seg)'
  ),
  catalog as (
    select m.id, m.name, min(tx.raw_merchant), count(*)::integer, max(tx.occurred_at)
    from public.merchants m
    join tx on tx.mid = m.id
    where m.photo_path is null
    group by m.id, m.name
  ),
  loose as (
    select null::uuid, mode() within group (order by tx.label), mode() within group (order by tx.raw_merchant),
           count(*)::integer, max(tx.occurred_at)
    from tx
    where tx.mid is null and tx.label is not null
    group by public.merchant_norm(tx.label)
  )
  select * from catalog
  union all
  select * from loose
  order by 4 desc, 5 desc;
end $$;
revoke execute on function public.admin_merchants_without_photo() from public, anon;
grant execute on function public.admin_merchants_without_photo() to authenticated;
