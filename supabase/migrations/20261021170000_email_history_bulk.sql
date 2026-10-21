-- Loading old voucher emails as history.
-- * ingest_voucher_as skips dates already covered by an imported bank statement for that account
--   ('covered_by_statement'), so history never duplicates statement rows.
-- * ingest_bac_voucher_bulk: same as ingest_bac_voucher but marks the session as a bulk load, so the
--   per-row AI call is skipped; categorize_backlog() (every 5 minutes) sends up to 40 at a time instead.
-- Full function bodies live in the database; this file records what changed.

create or replace function public.queue_ai_categorization() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('finanzas.bulk', true), '') = '1' then return new; end if;
  if new.category_id is null and new.kind in ('expense','income','refund') and new.ai_checked_at is null then
    perform net.http_post(
      url := 'https://vzgnujopgryuskixcnnx.supabase.co/functions/v1/categorize',
      body := jsonb_build_object('tx_ids', jsonb_build_array(new.id)),
      headers := jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 20000
    );
  end if;
  return new;
end $$;

-- in ingest_voucher_as, right after the account is found:
--   select min(t.occurred_at), max(t.occurred_at) into lo, hi from public.transactions t where t.account_id = acc.id and t.source = 'import';
--   if lo is not null and p_occurred_at >= lo - interval '1 day' and p_occurred_at < hi + interval '1 day' then
--     return 'covered_by_statement';
--   end if;

CREATE OR REPLACE FUNCTION public.ingest_bac_voucher_bulk(p_token text, p_message_id text, p_last4 text, p_merchant text, p_amount numeric, p_currency text, p_occurred_at timestamp with time zone, p_tx_type text DEFAULT 'COMPRA'::text, p_auth text DEFAULT NULL::text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  perform set_config('finanzas.bulk', '1', true);
  return public.ingest_voucher_as(public.token_user(p_token), p_message_id, p_last4, p_merchant, p_amount, p_currency, p_occurred_at, p_tx_type, p_auth);
end $function$;
grant execute on function public.ingest_bac_voucher_bulk(text, text, text, text, numeric, text, timestamptz, text, text) to anon, authenticated;

-- retry_unmatched() also sets finanzas.bulk before loading saved vouchers.

create or replace function public.categorize_backlog() returns integer
language plpgsql security definer set search_path = public as $$
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
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 60000
  );
  return jsonb_array_length(ids);
end $$;
revoke execute on function public.categorize_backlog() from public, anon, authenticated;
select cron.schedule('categorize-backlog', '*/5 * * * *', 'select public.categorize_backlog()');
