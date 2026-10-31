-- Admin list of merchants without a logo: the movements behind one row, to tell where it's from.
-- Same rows admin_merchants_without_photo() counts: a catalog merchant (p_merchant) or a name that
-- isn't in the catalog yet (p_name, compared by its clean form). Date, bank text, clean name and
-- category only; never amounts. Newest 40.
create or replace function public.admin_merchant_movements(p_merchant uuid, p_name text)
returns table (id uuid, occurred_at timestamptz, raw_merchant text, merchant text, category text, emoji text, color text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select t.id, t.occurred_at, t.raw_merchant, t.merchant, c.name, c.emoji, c.color
  from public.transactions t
  left join public.categories c on c.id = t.category_id
  where t.kind in ('expense', 'refund')
    and t.visible
    and coalesce(t.raw_merchant, '') !~* '^\s*(cd sinpe|sinpe|comision|tef |atm |valor de tarjeta|db\. seg)'
    and case
      when p_merchant is not null then t.merchant_id = p_merchant
      else t.merchant_id is null
        and public.merchant_norm(coalesce(nullif(btrim(t.merchant), ''), nullif(btrim(t.raw_merchant), ''))) = public.merchant_norm(p_name)
    end
  order by t.occurred_at desc
  limit 40;
end $$;
revoke execute on function public.admin_merchant_movements(uuid, text) from public, anon;
grant execute on function public.admin_merchant_movements(uuid, text) to authenticated;
