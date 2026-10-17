-- Normalized merchant key: first two words, without URLs or trailing city.
-- "AUTO MERCADO PLAZA MAYOR SAN JOSE" -> "AUTO MERCADO", "UE COSTA RICA HTTPS://HELP." -> "UE COSTA"
create or replace function public.merchant_key(p text) returns text
language sql immutable set search_path = public as $$
  select nullif(array_to_string((regexp_split_to_array(btrim(
    regexp_replace(
      regexp_replace(upper(coalesce(p, '')), 'HTTPS?://\S*', '', 'g'),
      '\s+(SAN JOSE|HEREDIA|ESCAZU|CARTAGO|ALAJUELA)\b.*$', '')
  ), '\s+'))[1:2], ' '), '');
$$;

alter table public.transactions
  add column merchant_key text generated always as (public.merchant_key(coalesce(raw_merchant, merchant))) stored,
  add column category_source text check (category_source in ('auto','ai','manual')),
  add column suggested_category_id uuid references public.categories on delete set null,
  add column ai_confidence numeric(3,2);
create index transactions_merchant_key on public.transactions (space_id, merchant_key);

-- Order: rules the user taught (priority >= 50) > the space's own history > generic seeded rules.
create or replace function public.match_category(p_space uuid, p_merchant text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare c uuid; k text := public.merchant_key(p_merchant);
begin
  select r.category_id into c from public.merchant_rules r
  where r.space_id = p_space and r.priority >= 50 and upper(coalesce(p_merchant,'')) like '%' || upper(r.pattern) || '%'
  order by r.priority desc, length(r.pattern) desc limit 1;
  if c is not null then return c; end if;

  if k is not null then
    select t.category_id into c from public.transactions t
    join public.categories cc on cc.id = t.category_id and not cc.archived
    where t.space_id = p_space and t.merchant_key = k and t.status = 'posted' and t.category_id is not null
    group by t.category_id order by count(*) desc, max(t.occurred_at) desc limit 1;
    if c is not null then return c; end if;
  end if;

  select r.category_id into c from public.merchant_rules r
  where r.space_id = p_space and upper(coalesce(p_merchant,'')) like '%' || upper(r.pattern) || '%'
  order by r.priority desc, length(r.pattern) desc limit 1;
  return c;
end $$;
revoke execute on function public.match_category(uuid, text) from public, anon, authenticated;

-- mark automatically categorized vouchers so the app can tell them apart
create or replace function public.mark_auto_category() returns trigger language plpgsql set search_path = public as $$
begin
  if new.source in ('email','import') and new.category_id is not null and new.category_source is null then
    new.category_source := 'auto';
  end if;
  return new;
end $$;
create trigger transactions_mark_auto before insert on public.transactions for each row execute function public.mark_auto_category();
