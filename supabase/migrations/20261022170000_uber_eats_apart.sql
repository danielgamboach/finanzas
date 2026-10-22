-- Uber Eats is food delivery, Uber is a ride: never let one inherit the other's name or category.
create or replace function public.is_uber_eats(p text)
returns boolean language sql immutable set search_path = public as $$
  select upper(coalesce(p, '')) ~ '(UBER\s*\*?\s*EATS|UBEREATS|(^|[^A-Z])UB\s+EATS|^UE\s*\*?\s*COSTA RICA)';
$$;

create or replace function public.pretty_merchant(p text)
returns text language sql immutable set search_path = public as $$
  select case
    when p is null or btrim(p) = '' then 'Comercio sin nombre'
    when public.is_uber_eats(p) then 'Uber Eats'
    when upper(p) like '%UBER%' or upper(p) like 'UBR*%' then 'Uber'
    when upper(p) like 'APPLE.COM%' then 'Apple'
    else initcap(lower(regexp_replace(btrim(p), '\s+(SAN JOSE|HEREDIA|ESCAZU|CARTAGO|ALAJUELA)$', '', 'i')))
  end;
$$;

-- the history key groups charges by their first two words; "DLC* UBER EATS" and "DLC* UBER RIDES" used to share one
create or replace function public.merchant_key(p text)
returns text language sql immutable set search_path = public as $$
  select case
    when public.is_uber_eats(p) then 'UBER EATS'
    when upper(coalesce(p, '')) like '%UBER%' or upper(coalesce(p, '')) like 'UBR*%' then 'UBER'
    else nullif(array_to_string((regexp_split_to_array(btrim(
      regexp_replace(
        regexp_replace(upper(coalesce(p, '')), 'HTTPS?://\S*', '', 'g'),
        '\s+(SAN JOSE|HEREDIA|ESCAZU|CARTAGO|ALAJUELA)\b.*$', '')
    ), '\s+'))[1:2], ' '), '')
  end;
$$;

-- Eats rules win over history and over the plain UBER rule
update public.merchant_rules set priority = 60
where upper(pattern) in ('UBER EATS', 'UE COSTA RICA', 'UE COSTA', 'UE *COSTA');
insert into public.merchant_rules (space_id, pattern, category_id, priority)
select c.space_id, x.p, c.id, 60
from public.categories c cross join (values ('UBER EATS'), ('UBER *EATS'), ('UB EATS'), ('UE COSTA RICA'), ('UE *COSTA RICA')) x(p)
where c.name = 'Delivery' and not c.archived
on conflict (space_id, pattern) do update set priority = 60, category_id = excluded.category_id;

-- existing charges: name, category and a fresh history key
select set_config('finanzas.bulk', '1', true);
update public.transactions t set merchant = 'Uber Eats'
where public.is_uber_eats(coalesce(t.raw_merchant, t.merchant)) and (t.merchant is null or t.merchant ilike 'uber%');
update public.transactions t set category_id = d.id, status = 'posted'
from public.categories d
where d.space_id = t.space_id and d.name = 'Delivery' and not d.archived
  and public.is_uber_eats(coalesce(t.raw_merchant, t.merchant))
  and (t.category_id is null or t.category_id in (select id from public.categories where name = 'Transporte'));
update public.transactions set raw_merchant = raw_merchant
where upper(coalesce(raw_merchant, merchant, '')) like '%UB%' or upper(coalesce(raw_merchant, merchant, '')) like 'UE%';
