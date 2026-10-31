-- "Ignorar" in the admin list of merchants without a logo: merchants the admin doesn't want to fill in.
-- Key: 'm:<merchant id>' for catalog merchants, 'n:<clean name>' for names not in the catalog yet.
create table if not exists public.merchant_photo_skips (
  key text primary key,
  active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.merchant_photo_skips enable row level security;
-- no policies: only the admin functions below touch it

create or replace function public.merchant_photo_skip_key(p_merchant uuid, p_name text) returns text
language sql immutable set search_path = public as $$
  select case when p_merchant is not null then 'm:' || p_merchant::text else 'n:' || public.merchant_norm(p_name) end;
$$;

create or replace function public.admin_merchant_photo_skip(p_merchant uuid, p_name text, p_skip boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare k text := public.merchant_photo_skip_key(p_merchant, p_name);
begin
  if not public.is_app_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if k is null or k = 'n:' then return; end if;
  insert into public.merchant_photo_skips (key, active) values (k, p_skip)
  on conflict (key) do update set active = excluded.active, created_by = auth.uid(), created_at = now();
end $$;
revoke execute on function public.admin_merchant_photo_skip(uuid, text, boolean) from public, anon;
grant execute on function public.admin_merchant_photo_skip(uuid, text, boolean) to authenticated;

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
      and not exists (select 1 from public.merchant_photo_skips s where s.key = 'm:' || m.id::text and s.active)
    group by m.id, m.name
  ),
  loose as (
    select null::uuid, mode() within group (order by tx.label), mode() within group (order by tx.raw_merchant),
           count(*)::integer, max(tx.occurred_at)
    from tx
    where tx.mid is null and tx.label is not null
      and not exists (select 1 from public.merchant_photo_skips s where s.key = 'n:' || public.merchant_norm(tx.label) and s.active)
    group by public.merchant_norm(tx.label)
  )
  select * from catalog
  union all
  select * from loose
  order by 4 desc, 5 desc;
end $$;
