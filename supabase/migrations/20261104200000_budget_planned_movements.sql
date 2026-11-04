-- PRM: the budget is the month's real and planned movements. Fixed payments are their recurrents and
-- savings become recurring transfers; only open plans (kind 'cap') stay in envelopes.
-- A saving line with an account becomes a monthly manual transfer to that account, from the space's
-- first debit account in the same currency (or any debit account), due on the last day of the month.
insert into recurring (space_id, kind, merchant, amount, currency, account_id, to_account_id, frequency, method, auto, active, next_due)
select e.space_id, 'transfer', e.name, e.amount, e.currency,
  (select a.id from accounts a where a.space_id = e.space_id and a.kind = 'debit' and not a.archived
     order by (a.currency = e.currency) desc, a.created_at limit 1),
  e.account_id, 'monthly', 'transfer', false, true,
  (date_trunc('month', now() at time zone 'America/Costa_Rica') + interval '1 month - 1 day')::date
from envelopes e
where e.active and e.kind = 'saving' and e.account_id is not null and e.amount is not null
  and exists (select 1 from accounts a where a.space_id = e.space_id and a.kind = 'debit' and not a.archived)
  and not exists (select 1 from recurring r where r.space_id = e.space_id and r.kind = 'transfer' and r.to_account_id = e.account_id and r.active);

update envelopes set active = false where active and kind in ('fixed', 'saving');
