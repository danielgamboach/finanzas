-- A voucher can reach two mailboxes (Dani's and Kimmy's) with different Gmail message ids.
-- ingest_bac_voucher now treats as the same charge: same card + same authorization number,
-- or same card, amount, currency and merchant within two minutes.
CREATE OR REPLACE FUNCTION public.ingest_bac_voucher(p_token text, p_message_id text, p_last4 text, p_merchant text, p_amount numeric, p_currency text, p_occurred_at timestamp with time zone, p_tx_type text DEFAULT 'COMPRA'::text, p_auth text DEFAULT NULL::text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare u uuid; acc record; k text; cat uuid; fx numeric; n integer;
begin
  u := public.token_user(p_token);
  if p_amount is null or p_amount <= 0 then return 'skipped_zero'; end if;
  if p_currency not in ('CRC','USD') then return 'skipped_currency'; end if;

  select a.* into acc from public.accounts a
  join public.space_members m on m.space_id = a.space_id and m.user_id = u
  where a.last4 = p_last4 and not a.archived limit 1;

  if acc is null then
    insert into public.ingest_unmatched (user_id, payload, reason)
    values (u, jsonb_build_object('message_id',p_message_id,'last4',p_last4,'merchant',p_merchant,'amount',p_amount,'currency',p_currency,'occurred_at',p_occurred_at,'type',p_tx_type), 'no_account_for_card');
    return 'unmatched';
  end if;

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
