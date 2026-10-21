-- Vouchers whose card wasn't in the app yet are kept in ingest_unmatched. When an account gets
-- those last 4 digits (created, edited or unarchived), they are loaded automatically.
alter table public.ingest_unmatched add column if not exists resolved_at timestamptz, add column if not exists resolution text;

-- The voucher logic for a known user (no token). Only callable from other database functions.
CREATE OR REPLACE FUNCTION public.ingest_voucher_as(u uuid, p_message_id text, p_last4 text, p_merchant text, p_amount numeric, p_currency text, p_occurred_at timestamp with time zone, p_tx_type text DEFAULT 'COMPRA'::text, p_auth text DEFAULT NULL::text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare acc record; k text; cat uuid; fx numeric; n integer;
begin
  if p_amount is null or p_amount <= 0 then return 'skipped_zero'; end if;
  if p_currency not in ('CRC','USD') then return 'skipped_currency'; end if;

  select a.* into acc from public.accounts a
  join public.space_members m on m.space_id = a.space_id and m.user_id = u
  where a.last4 = p_last4 and not a.archived limit 1;

  if acc is null then
    insert into public.ingest_unmatched (user_id, payload, reason)
    values (u, jsonb_build_object('message_id',p_message_id,'last4',p_last4,'merchant',p_merchant,'amount',p_amount,'currency',p_currency,'occurred_at',p_occurred_at,'type',p_tx_type,'auth',p_auth), 'no_account_for_card');
    return 'unmatched';
  end if;

  -- the same voucher can reach two mailboxes with different message ids
  if exists (
    select 1 from public.transactions t
    where t.account_id = acc.id and t.source = 'email' and t.external_id is distinct from p_message_id
      and (
        (p_auth is not null and t.note = 'Autorización ' || p_auth)
        or (t.amount = p_amount and t.currency = p_currency and coalesce(t.raw_merchant, '') = coalesce(p_merchant, '')
            and abs(extract(epoch from (t.occurred_at - p_occurred_at))) < 120)
      )
  ) then
    return 'duplicate';
  end if;

  k := case when upper(coalesce(p_tx_type,'')) ~ '(DEVOL|REVERS|ANUL|CREDITO|REEMBOLSO)' then 'refund' else 'expense' end;
  fx := case when p_currency = 'USD' then public.current_fx((p_occurred_at at time zone 'America/Costa_Rica')::date) else 1 end;
  cat := public.match_category(acc.space_id, p_merchant);

  insert into public.transactions (space_id, kind, amount, currency, fx_rate, occurred_at, merchant, raw_merchant,
    category_id, account_id, status, source, external_id, note)
  values (acc.space_id, k, p_amount, p_currency, fx, p_occurred_at, public.pretty_merchant(p_merchant), p_merchant,
    cat, acc.id, case when cat is null then 'review' else 'posted' end, 'email', p_message_id,
    case when p_auth is not null then 'Autorización ' || p_auth end)
  on conflict (space_id, source, external_id) where external_id is not null do nothing;
  get diagnostics n = row_count;
  return case when n = 0 then 'duplicate' else 'inserted' end;
end $function$;
revoke execute on function public.ingest_voucher_as(uuid, text, text, text, numeric, text, timestamptz, text, text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ingest_bac_voucher(p_token text, p_message_id text, p_last4 text, p_merchant text, p_amount numeric, p_currency text, p_occurred_at timestamp with time zone, p_tx_type text DEFAULT 'COMPRA'::text, p_auth text DEFAULT NULL::text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  return public.ingest_voucher_as(public.token_user(p_token), p_message_id, p_last4, p_merchant, p_amount, p_currency, p_occurred_at, p_tx_type, p_auth);
end $function$;

CREATE OR REPLACE FUNCTION public.retry_unmatched(p_last4 text) RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare r record; res text; done integer := 0;
begin
  for r in
    select u.* from public.ingest_unmatched u
    where u.resolved_at is null and u.payload->>'last4' = p_last4
    order by (u.payload->>'occurred_at')::timestamptz
  loop
    if not exists (select 1 from public.accounts a join public.space_members m on m.space_id = a.space_id and m.user_id = r.user_id
                   where a.last4 = p_last4 and not a.archived) then
      continue;
    end if;
    res := public.ingest_voucher_as(r.user_id, r.payload->>'message_id', p_last4, r.payload->>'merchant', (r.payload->>'amount')::numeric,
      r.payload->>'currency', (r.payload->>'occurred_at')::timestamptz, coalesce(r.payload->>'type', 'COMPRA'), r.payload->>'auth');
    update public.ingest_unmatched set resolved_at = now(), resolution = res where id = r.id;
    done := done + 1;
  end loop;
  return done;
end $function$;
revoke execute on function public.retry_unmatched(text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.accounts_retry_unmatched() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if new.last4 is not null and not new.archived then perform public.retry_unmatched(new.last4); end if;
  return null;
end $function$;

create trigger accounts_retry_unmatched after insert or update of last4, archived on public.accounts
  for each row execute function public.accounts_retry_unmatched();

-- Data (applied once, 2026-10-21): "simbiosis legit" got last4 7408; "Tarjeta Kim" (7922) created in
-- Kimmy's personal space. 21 saved vouchers loaded, 2 recognized as duplicates.
