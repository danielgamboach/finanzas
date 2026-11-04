-- A recurrent's pattern also matches when the bank writes the name with dots or other signs:
-- "CNFL" now catches "C.N.F.L.PAGUELO" (letters and digits compared, everything else ignored).
-- Before, the voucher stayed unlinked and run_auto_recurring added a duplicate "Sin voucher" the next day.
CREATE OR REPLACE FUNCTION public.match_recurring()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; d date; lead integer; amt numeric; expected numeric; hay text; hay_bare text;
begin
  if new.recurring_id is not null or new.kind <> 'expense' or new.source not in ('email','import') then return new; end if;
  if upper(coalesce(new.raw_merchant, new.merchant, '')) like 'IVA %' then return new; end if;
  d := (new.occurred_at at time zone 'America/Costa_Rica')::date;
  amt := new.amount * coalesce(new.fx_rate, 1);
  hay := upper(coalesce(new.raw_merchant, '') || ' ' || coalesce(new.merchant, ''));
  hay_bare := regexp_replace(hay, '[^A-Z0-9]', '', 'g');
  for r in
    select * from public.recurring
    where space_id = new.space_id and active and kind = 'expense'
      and coalesce(match_pattern, '') <> ''
      and (hay like '%' || upper(match_pattern) || '%'
           or (length(regexp_replace(upper(match_pattern), '[^A-Z0-9]', '', 'g')) >= 3
               and hay_bare like '%' || regexp_replace(upper(match_pattern), '[^A-Z0-9]', '', 'g') || '%'))
    order by next_due
  loop
    lead := least(10, greatest(2, public.period_days(r.frequency, r.every_n, r.every_unit) / 3));
    expected := r.amount * case when r.currency = 'USD' then public.current_fx(d) else 1 end;
    if (r.variable or amt between expected * 0.65 and expected * 1.35) and (
         d between r.next_due - lead and r.next_due + greatest(lead, least(31, public.period_days(r.frequency, r.every_n, r.every_unit)))
         or exists (select 1 from public.transactions p where p.recurring_id = r.id and p.auto_flag = 'no_voucher'
                    and abs((p.occurred_at at time zone 'America/Costa_Rica')::date - d) <= lead)) then
      new.recurring_id := r.id;
      if new.category_id is null and r.category_id is not null then
        new.category_id := r.category_id;
        new.status := 'posted';
        new.category_source := 'auto';
      end if;
      delete from public.transactions p where p.recurring_id = r.id and p.auto_flag = 'no_voucher'
        and abs((p.occurred_at at time zone 'America/Costa_Rica')::date - d) <= lead;
      return new;
    end if;
  end loop;
  return new;
end $function$;
