-- Global merchant catalog.
-- A merchant ("ampm") has a name, an optional logo and one or more patterns ("AM PM", "AMPM").
-- A movement belongs to the merchant whose pattern appears as whole words in its bank name or its
-- clean name (accents, case and punctuation ignored); the longest pattern wins. That link lives in
-- transactions.merchant_id, set by a trigger, and it is what groups branches together everywhere.
-- The catalog is shared by every user: a logo or a pattern added once serves everyone.
-- Writes only go through the functions below, so the rules hold: anyone can add a merchant, a
-- pattern or a first logo; only an app admin can replace a logo, rename others' merchants or take
-- over someone else's pattern. Patterns are never deleted, only turned off (so undo is safe).

create extension if not exists pg_trgm with schema extensions;

-- "McDonald's Sabana" -> "mcdonald s sabana" (same as normWords in the app)
create or replace function public.merchant_norm(p text) returns text
language sql immutable set search_path = public as $$
  select btrim(regexp_replace(lower(translate(coalesce(p, ''),
    'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãéèëêíìïîóòöôõúùüûñç',
    'AAAAAEEEEIIIIOOOOOUUUUNCaaaaaeeeeiiiiooooouuuunc')), '[^a-z0-9]+', ' ', 'g'));
$$;

create or replace function public.is_app_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;
revoke execute on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;

create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 60),
  photo_path text,
  photo_by uuid references auth.users on delete set null,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.merchant_patterns (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants on delete cascade,
  pattern text not null,
  norm text generated always as (public.merchant_norm(pattern)) stored,
  active boolean not null default true,
  source text not null default 'user' check (source in ('seed', 'user', 'ai', 'admin')),
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  check (length(public.merchant_norm(pattern)) >= 2)
);
create unique index merchant_patterns_norm on public.merchant_patterns (norm) where active;
create index merchant_patterns_merchant on public.merchant_patterns (merchant_id);

alter table public.merchants enable row level security;
alter table public.merchant_patterns enable row level security;
create policy "merchants: signed-in read" on public.merchants for select to authenticated using (true);
create policy "merchant patterns: signed-in read" on public.merchant_patterns for select to authenticated using (true);
grant select on public.merchants, public.merchant_patterns to authenticated;

alter table public.transactions
  add column merchant_id uuid references public.merchants on delete set null,
  add column suggested_merchant_id uuid references public.merchants on delete set null;
create index transactions_merchant on public.transactions (space_id, merchant_id);

-- The merchant of a movement: the longest active pattern found in either name.
create or replace function public.resolve_merchant(p_raw text, p_name text) returns uuid
language sql stable security definer set search_path = public as $$
  select p.merchant_id from public.merchant_patterns p
  where p.active and (
    (' ' || public.merchant_norm(p_raw) || ' ') like ('% ' || p.norm || ' %')
    or (' ' || public.merchant_norm(p_name) || ' ') like ('% ' || p.norm || ' %'))
  order by length(p.norm) desc, p.created_at
  limit 1;
$$;

create or replace function public.set_tx_merchant() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.raw_merchant is distinct from old.raw_merchant
     or new.merchant is distinct from old.merchant or new.kind is distinct from old.kind then
    new.merchant_id := case when new.kind = 'transfer' then null else public.resolve_merchant(new.raw_merchant, new.merchant) end;
    if new.merchant_id is not null then new.suggested_merchant_id := null; end if;
  end if;
  return new;
end $$;
create trigger transactions_merchant before insert or update of raw_merchant, merchant, kind on public.transactions
  for each row execute function public.set_tx_merchant();

-- When a pattern appears, moves or turns off, re-link the movements it can affect.
create or replace function public.refresh_tx_merchants(p_norm text, p_merchant uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with cand as (
    select t.id, public.resolve_merchant(t.raw_merchant, t.merchant) as mid
    from public.transactions t
    where t.kind <> 'transfer' and (
      (p_merchant is not null and t.merchant_id = p_merchant)
      or (p_norm is not null and (
        (' ' || public.merchant_norm(t.raw_merchant) || ' ') like ('% ' || p_norm || ' %')
        or (' ' || public.merchant_norm(t.merchant) || ' ') like ('% ' || p_norm || ' %'))))
  )
  update public.transactions t
  set merchant_id = c.mid,
      suggested_merchant_id = case when c.mid is not null then null else t.suggested_merchant_id end
  from cand c
  where t.id = c.id and t.merchant_id is distinct from c.mid;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.refresh_tx_merchants(text, uuid) from public, anon, authenticated;

create or replace function public.merchant_patterns_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'DELETE' then perform public.refresh_tx_merchants(new.norm, new.merchant_id); end if;
  if tg_op <> 'INSERT' then perform public.refresh_tx_merchants(old.norm, old.merchant_id); end if;
  return null;
end $$;
create trigger merchant_patterns_refresh after insert or update or delete on public.merchant_patterns
  for each row execute function public.merchant_patterns_changed();

-- ───────── writes, with the rules ─────────

-- A new merchant with its first pattern. If the pattern already belongs to someone, returns that merchant.
create or replace function public.merchant_create(p_name text, p_pattern text) returns uuid
language plpgsql security definer set search_path = public as $$
declare n text := public.merchant_norm(p_pattern); m uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if length(n) < 3 and not public.is_app_admin() then raise exception 'pattern_short'; end if;
  if length(btrim(coalesce(p_name, ''))) = 0 then raise exception 'name_required'; end if;
  select merchant_id into m from public.merchant_patterns where norm = n and active;
  if m is not null then return m; end if;
  insert into public.merchants (name) values (left(btrim(p_name), 60)) returning id into m;
  insert into public.merchant_patterns (merchant_id, pattern, source)
  values (m, btrim(p_pattern), case when public.is_app_admin() then 'admin' else 'user' end);
  return m;
end $$;

-- "Unir con otro comercio": movements that say p_pattern belong to p_merchant from now on.
create or replace function public.merchant_add_pattern(p_merchant uuid, p_pattern text) returns uuid
language plpgsql security definer set search_path = public as $$
declare n text := public.merchant_norm(p_pattern); adm boolean := public.is_app_admin(); ex public.merchant_patterns; pid uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if length(n) < 3 and not adm then raise exception 'pattern_short'; end if;
  if not exists (select 1 from public.merchants where id = p_merchant) then raise exception 'no_merchant'; end if;
  select * into ex from public.merchant_patterns where norm = n and active;
  if found then
    if ex.merchant_id = p_merchant then return ex.id; end if;
    if not adm and ex.created_by is distinct from auth.uid() then raise exception 'pattern_taken'; end if;
    update public.merchant_patterns set merchant_id = p_merchant where id = ex.id;
    return ex.id;
  end if;
  insert into public.merchant_patterns (merchant_id, pattern, source)
  values (p_merchant, btrim(p_pattern), case when adm then 'admin' else 'user' end) returning id into pid;
  return pid;
end $$;

-- Undo a union: whoever added the pattern, or an admin.
create or replace function public.merchant_disable_pattern(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.merchant_patterns set active = false
  where id = p_id and active and (created_by = auth.uid() or public.is_app_admin());
  if not found then raise exception 'not_allowed'; end if;
end $$;

-- A merchant's logo: anyone can give it a first one, only an admin can replace it.
create or replace function public.merchant_set_photo(p_merchant uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
declare adm boolean := public.is_app_admin(); curr text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if not adm and (coalesce(p_path, '') !~ '^[0-9a-f-]{36}/m-[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
                  or not public.is_space_member(split_part(p_path, '/', 1)::uuid)) then raise exception 'bad_path'; end if;
  select photo_path into curr from public.merchants where id = p_merchant;
  if not found then raise exception 'no_merchant'; end if;
  if curr is not null and not adm then raise exception 'photo_exists'; end if;
  update public.merchants set photo_path = p_path, photo_by = auth.uid(), updated_at = now() where id = p_merchant;
end $$;

create or replace function public.merchant_rename(p_merchant uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if length(btrim(coalesce(p_name, ''))) = 0 then raise exception 'name_required'; end if;
  update public.merchants set name = left(btrim(p_name), 60), updated_at = now()
  where id = p_merchant and (created_by = auth.uid() or public.is_app_admin());
  if not found then raise exception 'not_allowed'; end if;
end $$;

revoke execute on function public.merchant_create(text, text), public.merchant_add_pattern(uuid, text),
  public.merchant_disable_pattern(uuid), public.merchant_set_photo(uuid, text), public.merchant_rename(uuid, text) from public, anon;
grant execute on function public.merchant_create(text, text), public.merchant_add_pattern(uuid, text),
  public.merchant_disable_pattern(uuid), public.merchant_set_photo(uuid, text), public.merchant_rename(uuid, text) to authenticated;

-- Known merchants that look like a name, for the AI to pick from ("AMPM ASAMBLEA" ~ "ampm").
create or replace function public.merchant_candidates(p_text text, p_limit integer default 5)
returns table (id uuid, name text, score real)
language sql stable security definer set search_path = public, extensions as $$
  with t as (select public.merchant_norm(p_text) as n)
  select m.id, m.name, max(greatest(
      extensions.word_similarity(p.norm, t.n),
      extensions.word_similarity(replace(p.norm, ' ', ''), replace(t.n, ' ', '')),
      extensions.word_similarity(public.merchant_norm(m.name), t.n))) as score
  from public.merchants m join public.merchant_patterns p on p.merchant_id = m.id and p.active, t
  where t.n <> ''
  group by m.id, m.name
  having max(greatest(
      extensions.word_similarity(p.norm, t.n),
      extensions.word_similarity(replace(p.norm, ' ', ''), replace(t.n, ' ', '')),
      extensions.word_similarity(public.merchant_norm(m.name), t.n))) >= 0.45
  order by score desc
  limit least(greatest(coalesce(p_limit, 5), 1), 10);
$$;
revoke execute on function public.merchant_candidates(text, integer) from public, anon, authenticated;
grant execute on function public.merchant_candidates(text, integer) to service_role;

-- ───────── history now follows the merchant, not just the first two words ─────────
create or replace function public.match_category(p_space uuid, p_merchant text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare c uuid; k text := public.merchant_key(p_merchant); mid uuid := public.resolve_merchant(p_merchant, null);
begin
  select r.category_id into c from public.merchant_rules r
  where r.space_id = p_space and r.priority >= 50 and upper(coalesce(p_merchant,'')) like '%' || upper(r.pattern) || '%'
  order by r.priority desc, length(r.pattern) desc limit 1;
  if c is not null then return c; end if;

  if mid is not null or k is not null then
    select t.category_id into c from public.transactions t
    join public.categories cc on cc.id = t.category_id and not cc.archived
    where t.space_id = p_space and t.status = 'posted' and t.category_id is not null
      and (case when mid is not null then t.merchant_id = mid else t.merchant_key = k end)
    group by t.category_id order by count(*) desc, max(t.occurred_at) desc limit 1;
    if c is not null then return c; end if;
  end if;

  select r.category_id into c from public.merchant_rules r
  where r.space_id = p_space and upper(coalesce(p_merchant,'')) like '%' || upper(r.pattern) || '%'
  order by r.priority desc, length(r.pattern) desc limit 1;
  return c;
end $$;
revoke execute on function public.match_category(uuid, text) from public, anon, authenticated;

-- Logo files: new uploads go to <space_id>/m-<uuid>.jpg (the bucket's member policies already allow
-- that folder). Storage policies belong to the storage admin role, so they can't change from here.

-- the per-space photos stay as history, read-only
revoke insert, update, delete on public.merchant_photos from authenticated;

-- ───────── seed: today's logos become catalog merchants (same file = same merchant) ─────────
do $$
declare r record; m uuid;
begin
  for r in
    select regexp_replace(path, '^[^/]+/', '') as f, min(path) as path, array_agg(distinct pattern) as patterns
    from public.merchant_photos group by 1
  loop
    insert into public.merchants (name, photo_path, created_by)
    values (case r.f when 'ampm.webp' then 'ampm' when 'didi.webp' then 'Didi' when 'parque-viva.webp' then 'Parque Viva'
                     else r.patterns[1] end, r.path, null)
    returning id into m;
    insert into public.merchant_patterns (merchant_id, pattern, source, created_by)
    select m, p, 'seed', null from unnest(r.patterns) p
    where not exists (select 1 from public.merchant_patterns x where x.norm = public.merchant_norm(p) and x.active);
  end loop;
end $$;

-- link every existing movement (the pattern trigger already did most; this is the full pass)
update public.transactions t set merchant_id = public.resolve_merchant(t.raw_merchant, t.merchant)
where t.kind <> 'transfer' and t.merchant_id is distinct from public.resolve_merchant(t.raw_merchant, t.merchant);
