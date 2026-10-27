-- A card charge that looks digital (a known service, or the AI says so) asks once:
-- "¿Es una suscripción?". Yes → how often → a recurring payment linked to it. No → never asked again
-- for that merchant in that space.

alter table public.transactions add column if not exists sub_ask text check (sub_ask in ('pending', 'done'));
create index if not exists transactions_sub_ask_pending on public.transactions (space_id) where sub_ask = 'pending';

-- one answer per merchant per space
create table if not exists public.subscription_answers (
  space_id uuid not null references public.spaces(id) on delete cascade,
  merchant text not null,
  is_sub boolean not null,
  recurring_id uuid references public.recurring(id) on delete set null,
  answered_by uuid,
  answered_at timestamptz not null default now(),
  primary key (space_id, merchant)
);
alter table public.subscription_answers enable row level security;
create policy subscription_answers_read on public.subscription_answers for select using (public.is_space_member(space_id));

/** The merchant a movement belongs to, for remembering the answer: catalog merchant, else its key, else its name. */
create or replace function public.sub_key(p_merchant_id uuid, p_raw text, p_merchant text)
returns text language sql immutable set search_path = public as $$
  select coalesce('m:' || p_merchant_id::text, 'k:' || public.merchant_key(p_raw), 'n:' || upper(nullif(btrim(p_merchant), '')));
$$;

/** Services that charge digitally, almost always on a plan. Apple goes through its receipts instead. */
create or replace function public.is_digital_merchant(p text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(upper(p) ~ (
    'NETFLIX|SPOTIFY|YOUTUBE|GOOGLE|OPENAI|CHATGPT|ANTHROPIC|CLAUDE\.AI|ADOBE|MICROSOFT|MSFT|XBOX|PLAYSTATION|SONY ?NETWORK|STEAMGAMES|NINTENDO'
    || '|DISNEY|HBO|MAX\.COM|PRIME ?VIDEO|AMAZON ?PRIME|AMZN DIGITAL|AMAZON DIGITAL|AUDIBLE|KINDLE|PARAMOUNT|CRUNCHYROLL|DEEZER|TIDAL|TWITCH|DISCORD'
    || '|DROPBOX|NOTION|FIGMA|CANVA|FRAMER|WEBFLOW|SQUARESPACE|WIX\.COM|GODADDY|NAMECHEAP|GITHUB|VERCEL|SUPABASE|NETLIFY|HEROKU|DIGITALOCEAN|CLOUDFLARE'
    || '|LINKEDIN|ZOOM\.US|ZOOM VIDEO|SLACK|1PASSWORD|LASTPASS|NORDVPN|EXPRESSVPN|SURFSHARK|PATREON|SUBSTACK|MEDIUM\.COM|DUOLINGO|HEADSPACE|CALM\.COM|STRAVA'
    || '|TINDER|BUMBLE|GRAMMARLY|MIDJOURNEY|CURSOR|PERPLEXITY|ELEVENLABS|SHUTTERSTOCK|ENVATO|SKILLSHARE|COURSERA|UDEMY|MASTERCLASS|NYTIMES|PADDLE|FASTSPRING'
    || '|LEMON ?SQUEEZY|GUMROAD|UBER ONE|RAPPI PRO|PEDIDOSYA PLUS|ICLOUD'
  ) and upper(p) !~ '^APPLE\.COM', false);
$$;

/** Whether a movement can be asked about at all (the AI and the known list both go through here). */
create or replace function public.sub_can_ask(t public.transactions)
returns boolean language sql stable security definer set search_path = public as $$
  select t.kind = 'expense' and t.source = 'email' and t.recurring_id is null and t.hold is null
    and coalesce(t.sub_ask, '') = ''
    and t.occurred_at > now() - interval '45 days'
    and upper(coalesce(t.raw_merchant, '')) !~ '^APPLE\.COM'
    and not exists (select 1 from public.subscription_answers a where a.space_id = t.space_id and a.merchant = public.sub_key(t.merchant_id, t.raw_merchant, t.merchant))
    -- a recurring payment for it already exists (even if this charge didn't fit its date or amount)
    and not exists (
      select 1 from public.recurring r where r.space_id = t.space_id and r.kind = 'expense' and coalesce(r.match_pattern, '') <> ''
        and upper(coalesce(t.raw_merchant, '') || ' ' || coalesce(t.merchant, '')) like '%' || upper(r.match_pattern) || '%'
    );
$$;

create or replace function public.sub_ask_on_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.sub_can_ask(new) and (
    public.is_digital_merchant(coalesce(new.raw_merchant, '') || ' ' || coalesce(new.merchant, ''))
    -- the same merchant is already waiting for an answer
    or exists (select 1 from public.transactions x where x.space_id = new.space_id and x.sub_ask = 'pending'
               and public.sub_key(x.merchant_id, x.raw_merchant, x.merchant) = public.sub_key(new.merchant_id, new.raw_merchant, new.merchant))
  ) then
    new.sub_ask := 'pending';
  end if;
  return new;
end $$;
-- after the merchant and recurring triggers (alphabetical order)
create trigger transactions_y_sub_ask before insert on public.transactions for each row execute function public.sub_ask_on_insert();

/** The categorize function calls this when the model thinks a charge is a digital subscription. */
create or replace function public.sub_ask_flag(p_tx uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare t public.transactions;
begin
  select * into t from public.transactions where id = p_tx;
  if t.id is null or not public.sub_can_ask(t) then return false; end if;
  update public.transactions set sub_ask = 'pending' where id = p_tx;
  return true;
end $$;
revoke all on function public.sub_ask_flag(uuid) from public, anon, authenticated;

/**
 * The person's answer for a movement (and every other movement of the same merchant waiting with it).
 * Yes creates the recurring payment from this charge and links it; the frequency is required then.
 * Returns the recurring id when one was created.
 */
create or replace function public.answer_subscription(p_tx uuid, p_is_sub boolean, p_frequency text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare t public.transactions; k text; d date; rid uuid; pat text;
begin
  select * into t from public.transactions where id = p_tx;
  if t.id is null or not public.is_space_member(t.space_id) then raise exception 'not allowed'; end if;
  if p_is_sub and coalesce(p_frequency, '') not in ('weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'semiannual', 'yearly') then
    raise exception 'frequency';
  end if;
  k := public.sub_key(t.merchant_id, t.raw_merchant, t.merchant);
  d := (t.occurred_at at time zone 'America/Costa_Rica')::date;

  if p_is_sub then
    -- what to recognize next charges by: the voucher's merchant key ("NETFLIX.COM"), else the name
    pat := coalesce(public.merchant_key(t.raw_merchant), upper(t.merchant));
    insert into public.recurring (space_id, kind, amount, currency, category_id, account_id, merchant, day_of_month, active,
      frequency, next_due, method, match_pattern, last_paid_on, variable)
    values (t.space_id, 'expense', t.amount, t.currency, t.category_id, t.account_id, coalesce(t.merchant, t.raw_merchant),
      extract(day from d)::smallint, true, p_frequency, public.add_period(d, p_frequency), 'card', pat, d, false)
    returning id into rid;
    update public.transactions set recurring_id = rid where id = t.id and recurring_id is null;
  end if;

  insert into public.subscription_answers (space_id, merchant, is_sub, recurring_id, answered_by)
  values (t.space_id, k, p_is_sub, rid, auth.uid())
  on conflict (space_id, merchant) do update set is_sub = excluded.is_sub, recurring_id = excluded.recurring_id,
    answered_by = excluded.answered_by, answered_at = now();

  update public.transactions set sub_ask = 'done'
  where space_id = t.space_id and sub_ask = 'pending' and public.sub_key(merchant_id, raw_merchant, merchant) = k;
  return rid;
end $$;
revoke all on function public.answer_subscription(uuid, boolean, text) from public, anon;
grant execute on function public.answer_subscription(uuid, boolean, text) to authenticated;

