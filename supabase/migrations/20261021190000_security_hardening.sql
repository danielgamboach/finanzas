-- Security hardening (sign-ups stay open):
--  1. Only app admins can write the shared exchange rate, and never a value far from the last one.
--  2. Daily AI quotas per user, so a new account can't burn the Anthropic credits.
--  3. Internal calls to the categorize function carry the internal secret.
--  4. Rules can only point to a category of the same space.
--  5. Trigger functions aren't callable through the API; helpers get a fixed search_path.

-- 1. exchange rate --------------------------------------------------------------------------------
create table if not exists public.app_admins (user_id uuid primary key references auth.users on delete cascade);
alter table public.app_admins enable row level security; -- no policies: only definer functions read it
revoke all on public.app_admins from anon, authenticated;
insert into public.app_admins (user_id) values ('92f8f5c6-e170-4058-9576-e63b0c2126e6') on conflict do nothing;

create or replace function public.set_fx_rate(p_token text, p_date date, p_rate numeric)
returns void language plpgsql security definer set search_path = public as $$
declare u uuid; prev numeric;
begin
  u := public.token_user(p_token);
  if not exists (select 1 from public.app_admins where user_id = u) then raise exception 'not allowed'; end if;
  if p_rate < 300 or p_rate > 1000 then raise exception 'rate out of range'; end if;
  if p_date > current_date + 1 then raise exception 'date in the future'; end if;
  select crc_per_usd into prev from public.fx_rates where rate_date < p_date order by rate_date desc limit 1;
  -- the colón doesn't move 15% from one published rate to the next; that would be a typo or tampering
  if prev is not null and abs(p_rate - prev) / prev > 0.15 then raise exception 'rate too far from previous (%)', prev; end if;
  insert into public.fx_rates (rate_date, crc_per_usd, source) values (p_date, p_rate, 'bccr')
  on conflict (rate_date) do update set crc_per_usd = excluded.crc_per_usd;
end $$;

-- 2. AI quotas ------------------------------------------------------------------------------------
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,
  at timestamptz not null default now()
);
create index if not exists ai_usage_user_kind_at on public.ai_usage (user_id, kind, at desc);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

-- true and counts one use when the caller is under p_limit uses of p_kind in the last 24 hours
create or replace function public.consume_ai_quota(p_kind text, p_limit integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null then return false; end if;
  if p_kind not in ('ask', 'insight', 'categorize') or p_limit < 1 or p_limit > 500 then return false; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text || p_kind));
  select count(*) into n from public.ai_usage where user_id = auth.uid() and kind = p_kind and at > now() - interval '24 hours';
  if n >= p_limit then return false; end if;
  insert into public.ai_usage (user_id, kind) values (auth.uid(), p_kind);
  return true;
end $$;
revoke execute on function public.consume_ai_quota(text, integer) from public, anon;
grant execute on function public.consume_ai_quota(text, integer) to authenticated;

-- 3. internal calls to categorize carry the secret --------------------------------------------------
create or replace function public.queue_ai_categorization()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('finanzas.bulk', true), '') = '1' then return new; end if;
  if new.category_id is null and new.kind in ('expense','income','refund') and new.ai_checked_at is null then
    perform net.http_post(
      url := 'https://vzgnujopgryuskixcnnx.supabase.co/functions/v1/categorize',
      body := jsonb_build_object('tx_ids', jsonb_build_array(new.id)),
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-notify-secret', (select value from public.app_secrets where key = 'notify_secret')),
      timeout_milliseconds := 20000
    );
  end if;
  return new;
end $$;

create or replace function public.categorize_backlog()
returns integer language plpgsql security definer set search_path = public as $$
declare ids jsonb;
begin
  select jsonb_agg(id) into ids from (
    select t.id from public.transactions t
    where t.category_id is null and t.ai_checked_at is null and t.kind in ('expense','income','refund')
      and t.created_at > now() - interval '2 days' and t.created_at < now() - interval '1 minute'
    order by t.created_at limit 40
  ) x;
  if ids is null then return 0; end if;
  perform net.http_post(
    url := 'https://vzgnujopgryuskixcnnx.supabase.co/functions/v1/categorize',
    body := jsonb_build_object('tx_ids', ids),
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-notify-secret', (select value from public.app_secrets where key = 'notify_secret')),
    timeout_milliseconds := 60000
  );
  return jsonb_array_length(ids);
end $$;

-- 4. rules stay inside their space ----------------------------------------------------------------
create or replace function public.save_rule_and_apply(p_space uuid, p_pattern text, p_category uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_space_member(p_space) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.categories where id = p_category and space_id = p_space) then raise exception 'category not in space'; end if;
  if length(trim(coalesce(p_pattern, ''))) < 2 then raise exception 'pattern too short'; end if;
  insert into public.merchant_rules (space_id, pattern, category_id, priority) values (p_space, upper(trim(p_pattern)), p_category, 50)
  on conflict (space_id, pattern) do update set category_id = excluded.category_id;
  update public.transactions set category_id = p_category, status = 'posted'
  where space_id = p_space and upper(coalesce(raw_merchant, merchant, '')) like '%' || upper(trim(p_pattern)) || '%'
    and (category_id is null or status = 'review');
  get diagnostics n = row_count;
  return n;
end $$;

-- 5. API surface ----------------------------------------------------------------------------------
revoke execute on function public.accounts_retry_unmatched() from public, anon, authenticated;
revoke execute on function public.advance_recurring() from public, anon, authenticated;
revoke execute on function public.check_limit_alert() from public, anon, authenticated;
revoke execute on function public.match_recurring() from public, anon, authenticated;
revoke execute on function public.queue_ai_categorization() from public, anon, authenticated;
revoke execute on function public.categorize_backlog() from public, anon, authenticated;

alter function public.add_period(date, text) set search_path = public;
alter function public.crc_text(numeric) set search_path = public;
alter function public.period_days(text) set search_path = public;

-- leftover from the first logo import; RLS on and no grants, so unreachable. Drop by hand when convenient:
-- drop table if exists public._seed_logos;
