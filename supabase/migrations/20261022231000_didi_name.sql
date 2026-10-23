-- "DLC* DIDI" showed up as "Dlc* Didi": name it Didi, like Uber.
create or replace function public.pretty_merchant(p text)
 returns text
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case
    when p is null or btrim(p) = '' then 'Comercio sin nombre'
    when public.is_uber_eats(p) then 'Uber Eats'
    when upper(p) like '%UBER%' or upper(p) like 'UBR*%' then 'Uber'
    when upper(p) ~ '(^|[^A-Z])DIDI([^A-Z]|$)' then 'Didi'
    when upper(p) like 'APPLE.COM%' then 'Apple'
    else initcap(lower(regexp_replace(btrim(p), '\s+(SAN JOSE|HEREDIA|ESCAZU|CARTAGO|ALAJUELA)$', '', 'i')))
  end;
$function$;

update public.transactions set merchant = 'Didi' where merchant = 'Dlc* Didi';
