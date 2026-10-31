-- Purchases in installments (TAR-11): a card expense split in N monthly payments. The whole purchase counts as
-- spending the day it happened; the card owes one installment per month, from that day on.

alter table public.transactions add column if not exists installments smallint check (installments is null or installments between 2 and 60);

create or replace function public.check_installments() returns trigger language plpgsql set search_path = public as $$
begin
  if new.installments is not null and (new.kind <> 'expense' or not exists (select 1 from public.accounts where id = new.account_id and kind = 'credit_card')) then
    new.installments := null;
  end if;
  return new;
end $$;
create or replace trigger transactions_installments before insert or update of installments, kind, account_id on public.transactions
  for each row execute function public.check_installments();

-- Same as before, but an installment purchase adds one part per month (the last part takes the rounding).
create or replace function public.card_owed(p_card uuid, p_at timestamptz default now())
returns table (crc numeric, usd numeric) language plpgsql stable security definer set search_path = public as $$
declare main uuid := public.card_main(p_card); sd int; b_crc numeric := 0; b_usd numeric := 0; b_at timestamptz;
begin
  if not exists (select 1 from public.accounts a where a.id = main and public.is_space_member(a.space_id)) and auth.uid() is not null then
    raise exception 'not allowed';
  end if;
  select statement_day into sd from public.accounts where id = main;
  select s.balance, coalesce(s.balance_usd, 0), public.snapshot_moment(s.taken_on, s.created_at) into b_crc, b_usd, b_at
  from public.balance_snapshots s where s.account_id = main and public.snapshot_moment(s.taken_on, s.created_at) <= p_at
  order by public.snapshot_moment(s.taken_on, s.created_at) desc limit 1;
  if b_at is null then
    b_crc := 0; b_usd := 0;
    b_at := case when sd is null then (date_trunc('month', p_at at time zone 'America/Costa_Rica') at time zone 'America/Costa_Rica') - interval '1 millisecond'
                 else ((public.card_last_cut(sd, p_at) + 1)::timestamp at time zone 'America/Costa_Rica') - interval '1 millisecond' end;
  end if;
  return query
  with fam as (select id from public.accounts where id = main or parent_account_id = main),
  e as (
    -- one entry per movement, or one per installment
    select t.currency, t.occurred_at + make_interval(months => k) at_,
      case when t.account_id in (select id from fam) and t.kind = 'expense' then
             case when coalesce(t.installments, 1) = 1 then t.amount
                  when k < t.installments - 1 then round(t.amount / t.installments, 2)
                  else t.amount - round(t.amount / t.installments, 2) * (t.installments - 1) end
           when t.account_id in (select id from fam) and t.kind = 'refund' then -t.amount
           when t.to_account_id in (select id from fam) and t.kind = 'transfer' then -t.amount
           else 0 end v
    from public.transactions t
    cross join lateral generate_series(0, coalesce(case when t.kind = 'expense' then t.installments end, 1) - 1) k
    where (t.account_id in (select id from fam) or t.to_account_id in (select id from fam)) and t.hold is null
      and t.occurred_at <= p_at and t.occurred_at > b_at - interval '60 months'
  )
  select b_crc + coalesce(sum(v) filter (where currency = 'CRC'), 0), b_usd + coalesce(sum(v) filter (where currency = 'USD'), 0)
  from e where at_ > b_at and at_ <= p_at;
end $$;
grant execute on function public.card_owed(uuid, timestamptz) to authenticated;
