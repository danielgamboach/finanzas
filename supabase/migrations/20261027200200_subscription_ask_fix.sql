-- Known services only match from the start of a word ("NOISY NEIGHBOURS" is not HBO), and a merchant
-- that already has a recurring payment by name is never asked about ("Amazon Prime" with another pattern).

create or replace function public.is_digital_merchant(p text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(upper(p) ~ (
    '(^|[^A-Z0-9])('
    || 'NETFLIX|SPOTIFY|YOUTUBE|GOOGLE|OPENAI|CHATGPT|ANTHROPIC|CLAUDE\.AI|ADOBE|MICROSOFT|MSFT|XBOX|PLAYSTATION|SONY ?NETWORK|STEAMGAMES|NINTENDO'
    || '|DISNEY|HBO|MAX\.COM|PRIME ?VIDEO|AMAZON ?PRIME|AMZN DIGITAL|AMAZON DIGITAL|AUDIBLE|KINDLE|PARAMOUNT|CRUNCHYROLL|DEEZER|TIDAL|TWITCH|DISCORD'
    || '|DROPBOX|NOTION|FIGMA|CANVA|FRAMER|WEBFLOW|SQUARESPACE|WIX\.COM|GODADDY|NAMECHEAP|GITHUB|VERCEL|SUPABASE|NETLIFY|HEROKU|DIGITALOCEAN|CLOUDFLARE'
    || '|LINKEDIN|ZOOM\.US|ZOOM VIDEO|SLACK|1PASSWORD|LASTPASS|NORDVPN|EXPRESSVPN|SURFSHARK|PATREON|SUBSTACK|MEDIUM\.COM|DUOLINGO|HEADSPACE|CALM\.COM|STRAVA'
    || '|TINDER|BUMBLE|GRAMMARLY|MIDJOURNEY|CURSOR|PERPLEXITY|ELEVENLABS|SHUTTERSTOCK|ENVATO|SKILLSHARE|COURSERA|UDEMY|MASTERCLASS|NYTIMES|PADDLE|FASTSPRING'
    || '|LEMON ?SQUEEZY|GUMROAD|UBER ONE|RAPPI PRO|PEDIDOSYA PLUS|ICLOUD'
    || ')'
  ) and upper(p) !~ '^APPLE\.COM', false);
$$;

create or replace function public.sub_can_ask(t public.transactions)
returns boolean language sql stable security definer set search_path = public as $$
  select t.kind = 'expense' and t.source = 'email' and t.recurring_id is null and t.hold is null
    and coalesce(t.sub_ask, '') = ''
    and t.occurred_at > now() - interval '45 days'
    and upper(coalesce(t.raw_merchant, '')) !~ '^APPLE\.COM'
    and not exists (select 1 from public.subscription_answers a where a.space_id = t.space_id and a.merchant = public.sub_key(t.merchant_id, t.raw_merchant, t.merchant))
    -- a recurring payment for it already exists (even if this charge didn't fit its date or amount)
    and not exists (
      select 1 from public.recurring r where r.space_id = t.space_id and r.kind = 'expense'
        and ((coalesce(r.match_pattern, '') <> '' and upper(coalesce(t.raw_merchant, '') || ' ' || coalesce(t.merchant, '')) like '%' || upper(r.match_pattern) || '%')
             or lower(btrim(r.merchant)) = lower(btrim(coalesce(t.merchant, ''))))
    );
$$;
