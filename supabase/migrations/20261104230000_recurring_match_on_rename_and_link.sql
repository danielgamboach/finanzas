-- A voucher can get its clean name after it was inserted (merchant catalog, AI). Match it to a recurrent again
-- when its name changes, and move the recurrent forward whenever a movement gets linked after the fact
-- (by that match or by hand), not only on insert. Example: "CLARO TIENDA EN LINEA" renamed "Claro Hogar Internet"
-- stayed apart from the recurrent "Claro Hogar", which kept showing as due on the 9th.
drop trigger if exists transactions_a_recurring_rename on public.transactions;
create trigger transactions_a_recurring_rename
  before update of merchant on public.transactions
  for each row when (new.recurring_id is null and new.merchant is distinct from old.merchant)
  execute function public.match_recurring();

drop trigger if exists transactions_z_advance_recurring_link on public.transactions;
create trigger transactions_z_advance_recurring_link
  after update of recurring_id on public.transactions
  for each row when (old.recurring_id is null and new.recurring_id is not null)
  execute function public.advance_recurring();
