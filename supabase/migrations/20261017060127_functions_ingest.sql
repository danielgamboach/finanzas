create or replace function public.token_user(p_token text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare u uuid;
begin
  update public.ingest_tokens set last_used_at = now()
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  returning user_id into u;
  if u is null then raise exception 'invalid token'; end if;
  return u;
end $$;

create or replace function public.pretty_merchant(p text) returns text
language sql immutable set search_path = public as $$
  select case
    when p is null or btrim(p) = '' then 'Comercio sin nombre'
    when upper(p) like 'UE COSTA RICA%' or upper(p) like 'UBER EATS%' then 'Uber Eats'
    when upper(p) like '%UBER%' then 'Uber'
    when upper(p) like 'APPLE.COM%' then 'Apple'
    else initcap(lower(regexp_replace(btrim(p), '\s+(SAN JOSE|HEREDIA|ESCAZU|CARTAGO|ALAJUELA)$', '', 'i')))
  end;
$$;

create or replace function public.ingest_bac_voucher(
  p_token text, p_message_id text, p_last4 text, p_merchant text, p_amount numeric,
  p_currency text, p_occurred_at timestamptz, p_tx_type text default 'COMPRA', p_auth text default null
) returns text
language plpgsql security definer set search_path = public as $$
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
end $$;

-- bulk import of historical rows (from the Sheet or a bank statement)
-- rows: [{date:'2026-09-23', merchant:'...', amount:123.45, currency:'CRC'|'USD', fx:450, category:'Súper', kind:'expense', seq:'tab:12'}]
create or replace function public.import_rows(p_token text, p_last4 text, p_rows jsonb, p_source_tag text default 'sheet') returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u uuid; acc record; r jsonb; i integer := 0; ins integer := 0; cat uuid; n integer; ext text;
begin
  u := public.token_user(p_token);
  select a.* into acc from public.accounts a
  join public.space_members m on m.space_id = a.space_id and m.user_id = u
  where a.last4 = p_last4 and not a.archived limit 1;
  if acc is null then raise exception 'no account for card %', p_last4; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    select c.id into cat from public.categories c
      where c.space_id = acc.space_id and lower(c.name) = lower(r->>'category') limit 1;
    if cat is null then cat := public.match_category(acc.space_id, r->>'merchant'); end if;
    ext := p_source_tag || ':' || encode(extensions.digest((r->>'date') || '|' || (r->>'merchant') || '|' || (r->>'amount') || '|' || coalesce(r->>'seq','') , 'sha256'), 'hex');
    insert into public.transactions (space_id, kind, amount, currency, fx_rate, occurred_at, merchant, raw_merchant,
      category_id, account_id, status, source, external_id)
    values (acc.space_id, coalesce(r->>'kind','expense'), (r->>'amount')::numeric, r->>'currency',
      case when r->>'currency' = 'USD' then coalesce((r->>'fx')::numeric, public.current_fx((r->>'date')::date)) else 1 end,
      ((r->>'date')::date + time '12:00') at time zone 'America/Costa_Rica',
      public.pretty_merchant(r->>'merchant'), r->>'merchant', cat, acc.id,
      case when cat is null then 'review' else 'posted' end, 'import', ext)
    on conflict (space_id, source, external_id) where external_id is not null do nothing;
    get diagnostics n = row_count;
    ins := ins + n;
  end loop;
  return jsonb_build_object('rows', i, 'inserted', ins);
end $$;

create or replace function public.set_fx_rate(p_token text, p_date date, p_rate numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.token_user(p_token);
  if p_rate < 300 or p_rate > 1000 then raise exception 'rate out of range'; end if;
  insert into public.fx_rates (rate_date, crc_per_usd, source) values (p_date, p_rate, 'bccr')
  on conflict (rate_date) do update set crc_per_usd = excluded.crc_per_usd;
end $$;

create or replace function public.generate_recurring_for(u uuid, p_today date default (now() at time zone 'America/Costa_Rica')::date) returns integer
language plpgsql security definer set search_path = public as $$
declare rec record; total integer := 0; n integer; d date;
begin
  for rec in
    select r.* from public.recurring r
    join public.space_members m on m.space_id = r.space_id and m.user_id = u
    where r.active and r.day_of_month <= extract(day from p_today)
      and (r.last_generated is null or r.last_generated < date_trunc('month', p_today)::date)
  loop
    d := make_date(extract(year from p_today)::int, extract(month from p_today)::int, rec.day_of_month);
    insert into public.transactions (space_id, kind, amount, currency, fx_rate, occurred_at, merchant, category_id, account_id,
      recurring_id, source, external_id)
    values (rec.space_id, rec.kind, rec.amount, rec.currency,
      case when rec.currency = 'USD' then public.current_fx(d) else 1 end,
      (d + time '09:00') at time zone 'America/Costa_Rica', rec.merchant, rec.category_id, rec.account_id,
      rec.id, 'recurring', 'rec:' || rec.id || ':' || to_char(d, 'YYYY-MM'))
    on conflict (space_id, source, external_id) where external_id is not null do nothing;
    get diagnostics n = row_count;
    total := total + n;
    update public.recurring set last_generated = d where id = rec.id;
  end loop;
  return total;
end $$;

create or replace function public.heartbeat(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid; g integer;
begin
  u := public.token_user(p_token);
  g := public.generate_recurring_for(u);
  return jsonb_build_object('ok', true, 'recurring_generated', g, 'at', now());
end $$;

-- the app can also trigger recurring generation for the signed-in user
create or replace function public.generate_my_recurring() returns integer
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  return public.generate_recurring_for(auth.uid());
end $$;

-- lock down internal functions
revoke execute on function public.seed_space_defaults(uuid, text) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.token_user(text) from public, anon, authenticated;
revoke execute on function public.match_category(uuid, text) from public, anon, authenticated;
revoke execute on function public.generate_recurring_for(uuid, date) from public, anon, authenticated;
revoke execute on function public.create_space(text, text, text) from public, anon;
revoke execute on function public.create_invite(uuid) from public, anon;
revoke execute on function public.accept_invite(text) from public, anon;
revoke execute on function public.create_ingest_token(text) from public, anon;
revoke execute on function public.save_rule_and_apply(uuid, text, uuid) from public, anon;
revoke execute on function public.generate_my_recurring() from public, anon;
grant execute on function public.create_space(text, text, text) to authenticated;
grant execute on function public.create_invite(uuid) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.create_ingest_token(text) to authenticated;
grant execute on function public.save_rule_and_apply(uuid, text, uuid) to authenticated;
grant execute on function public.generate_my_recurring() to authenticated;
-- token-authenticated endpoints for the Google script
grant execute on function public.ingest_bac_voucher(text, text, text, text, numeric, text, timestamptz, text, text) to anon, authenticated;
grant execute on function public.import_rows(text, text, jsonb, text) to anon, authenticated;
grant execute on function public.set_fx_rate(text, date, numeric) to anon, authenticated;
grant execute on function public.heartbeat(text) to anon, authenticated;
