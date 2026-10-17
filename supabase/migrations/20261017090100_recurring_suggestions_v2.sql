-- Stricter subscription detection: about one charge per calendar month, evenly spaced (24-38 days apart),
-- steady amount. Merchant variants like "NETFLIX.COM 844-5" / "NETFLIX.COM 866-5" are grouped by their first word.
create or replace function public.recurring_suggestions(p_space uuid)
returns table (merchant_key text, merchant text, raw_merchant text, currency text, amount numeric, months integer,
               last_date date, next_guess date, category_id uuid, account_id uuid)
language sql stable security invoker set search_path = public as $$
  with tx as (
    select case when length(split_part(t.merchant_key, ' ', 1)) >= 5 then split_part(t.merchant_key, ' ', 1) else t.merchant_key end k,
           t.merchant, t.raw_merchant, t.currency, t.amount, t.category_id, t.account_id,
           (t.occurred_at at time zone 'America/Costa_Rica')::date d
    from public.transactions t
    where t.space_id = p_space and t.kind = 'expense' and t.recurring_id is null
      and t.occurred_at > now() - interval '200 days'
      and coalesce(t.merchant_key, '') <> '' and upper(coalesce(t.raw_merchant, t.merchant, '')) not like 'IVA %'
  ), gaps as (
    select k, currency, d, amount, d - lag(d) over (partition by k, currency order by d) gap from tx
  ), g as (
    select k, currency,
           percentile_cont(0.5) within group (order by amount) med,
           count(distinct date_trunc('month', d)) months, count(*) n, max(d) last_date,
           min(gap) min_gap, max(gap) max_gap
    from gaps group by 1, 2
  )
  select g.k,
         (select merchant from tx where tx.k = g.k order by d desc limit 1),
         (select raw_merchant from tx where tx.k = g.k order by d desc limit 1),
         g.currency, round(g.med::numeric, 2), g.months::int, g.last_date,
         (g.last_date + interval '1 month')::date,
         (select category_id from tx where tx.k = g.k and category_id is not null order by d desc limit 1),
         (select account_id from tx where tx.k = g.k order by d desc limit 1)
  from g
  where g.months >= 2 and g.n = g.months
    and g.min_gap >= 24 and g.max_gap <= 38
    and g.last_date > current_date - 40
    and (select count(*) from tx where tx.k = g.k and tx.currency = g.currency
           and tx.amount between g.med * 0.85 and g.med * 1.15) = g.n
    and not exists (select 1 from public.recurring r where r.space_id = p_space and r.active and coalesce(r.match_pattern, '') <> ''
                    and (g.k like '%' || upper(r.match_pattern) || '%' or upper(r.match_pattern) like '%' || g.k || '%'))
    and not exists (select 1 from public.recurring_dismissals x where x.space_id = p_space and x.merchant_key = g.k)
  order by g.months desc, g.last_date desc
  limit 12;
$$;
grant execute on function public.recurring_suggestions(uuid) to authenticated;
