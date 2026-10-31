-- Base de cuentas y movimientos (docs/comportamiento: CTA-12, CTA-13, CTA-14, MOV-01, MOV-02, MOV-03).
-- * Cada espacio tiene una cuenta Efectivo (system = 'cash'), que puede llevar saldo o no.
-- * Todo movimiento tiene cuenta: sin cuenta, va al Efectivo del espacio.
-- * Qué puede hacer cada tipo de cuenta (pagar gastos, recibir ingresos, mandar o recibir dinero).
-- * Mover dinero puede ir a una cuenta de otro espacio del que la persona es miembro (to_space_id),
--   y se ve en los dos espacios. Reemplaza los aportes.

-- accounts ---------------------------------------------------------------------------------------
alter table public.accounts add column if not exists track_balance boolean not null default true;
alter table public.accounts add column if not exists system text;
alter table public.accounts add constraint accounts_system_check check (system is null or system = 'cash');
create unique index if not exists accounts_one_cash on public.accounts (space_id) where system = 'cash';

-- The space's cash account, created the first time it's needed.
create or replace function public.cash_account(p_space uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare a uuid;
begin
  select id into a from public.accounts where space_id = p_space and system = 'cash';
  if a is null then
    insert into public.accounts (space_id, name, kind, currency, emoji, track_balance, system)
    values (p_space, 'Efectivo', 'cash', 'CRC', '💵', false, 'cash')
    on conflict do nothing
    returning id into a;
    if a is null then select id into a from public.accounts where space_id = p_space and system = 'cash'; end if;
  end if;
  return a;
end $$;
revoke execute on function public.cash_account(uuid) from public, anon, authenticated;

-- The cash account can be renamed and can start or stop keeping a balance, but it can't be deleted,
-- archived or turned into another kind. Only the database creates it.
create or replace function public.protect_cash_account() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if current_user in ('authenticated', 'anon') then new.system := null; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.system = 'cash' and coalesce(current_setting('finanzas.space_delete', true), '') <> '1' then
      raise exception 'La cuenta Efectivo no se puede eliminar';
    end if;
    return old;
  end if;
  if old.system = 'cash' then
    if new.archived then raise exception 'La cuenta Efectivo no se puede archivar'; end if;
    new.system := 'cash';
    new.kind := 'cash';
    new.space_id := old.space_id;
  else
    new.system := old.system;
  end if;
  return new;
end $$;
drop trigger if exists accounts_protect_cash on public.accounts;
create trigger accounts_protect_cash before insert or update or delete on public.accounts
  for each row execute function public.protect_cash_account();

create or replace function public.spaces_cash_account() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.cash_account(new.id);
  return null;
end $$;
drop trigger if exists spaces_cash on public.spaces;
create trigger spaces_cash after insert on public.spaces for each row execute function public.spaces_cash_account();

select public.cash_account(id) from public.spaces;

-- transactions -----------------------------------------------------------------------------------
alter table public.transactions add column if not exists to_space_id uuid references public.spaces(id) on delete set null;
create index if not exists transactions_to_space on public.transactions (to_space_id) where to_space_id is not null;

-- Accounts, categories and what each kind of account can do.
create or replace function public.check_tx_refs() returns trigger
language plpgsql set search_path = public as $$
declare src text; dst record; touched boolean;
begin
  if new.kind = 'contribution' then new.kind := 'transfer'; end if;
  if new.category_id is not null and not exists (select 1 from public.categories c where c.id = new.category_id and c.space_id = new.space_id) then
    raise exception 'category does not belong to space';
  end if;
  -- every movement has an account: the space's cash when none is given
  if new.account_id is null then new.account_id := public.cash_account(new.space_id); end if;
  select kind into src from public.accounts a where a.id = new.account_id and a.space_id = new.space_id;
  if src is null then raise exception 'account does not belong to space'; end if;

  if new.kind = 'transfer' then
    if new.to_account_id is null then raise exception 'Elegí a qué cuenta va el dinero'; end if;
    select id, space_id, kind into dst from public.accounts where id = new.to_account_id;
    if dst.id is null then raise exception 'destination account not found'; end if;
    if new.to_account_id = new.account_id then raise exception 'La cuenta de origen y la de destino son la misma'; end if;
    if dst.space_id <> new.space_id and auth.uid() is not null and not public.is_space_member(dst.space_id) then
      raise exception 'destination account not available';
    end if;
    new.to_space_id := case when dst.space_id <> new.space_id then dst.space_id end;
  else
    new.to_account_id := null;
    new.to_space_id := null;
  end if;

  touched := tg_op = 'INSERT' or new.kind is distinct from old.kind or new.account_id is distinct from old.account_id
    or new.to_account_id is distinct from old.to_account_id;
  if touched then
    if new.kind = 'expense' and src in ('cdp', 'investment', 'loan') then
      raise exception 'Esta cuenta no sirve para pagar gastos';
    end if;
    if new.kind = 'refund' and src in ('cdp', 'investment', 'loan') then
      raise exception 'Esta cuenta no recibe devoluciones';
    end if;
    if new.kind = 'income' and src in ('credit_card', 'loan') then
      raise exception 'Esta cuenta no recibe ingresos';
    end if;
    if new.kind = 'transfer' and src in ('credit_card', 'loan') then
      raise exception 'De esta cuenta no puede salir dinero';
    end if;
  end if;

  if new.currency = 'CRC' then new.fx_rate := 1; end if;
  return new;
end $$;

-- A transfer to a shared space is also visible there.
drop policy if exists transactions_select_incoming on public.transactions;
create policy transactions_select_incoming on public.transactions for select to authenticated
  using (to_space_id is not null and public.is_space_member(to_space_id));

-- Movements without an account go to the space's cash.
update public.transactions set account_id = public.cash_account(space_id)
where account_id is null and kind <> 'contribution';

-- Contributions become transfers ---------------------------------------------------------------
create table if not exists public._contributions_backup as
  select * from public.transactions where kind = 'contribution';
alter table public._contributions_backup enable row level security;

-- who made it: the contributor, or the member named in "Aporte de <nombre>"
update public.transactions t set contributor_id = (
  select p.id from public.profiles p join public.space_members m on m.user_id = p.id
  where m.space_id = t.space_id and t.merchant = 'Aporte de ' || p.name limit 1)
where t.kind = 'contribution' and t.contributor_id is null;

-- known person: it leaves the cash of their personal space (the update above already made them transfers)
update public.transactions t set
  kind = 'transfer',
  space_id = ps.id,
  account_id = public.cash_account(ps.id)
from (
  select distinct on (m.user_id) m.user_id, s.id
  from public.space_members m join public.spaces s on s.id = m.space_id
  where s.kind = 'personal' and m.role = 'owner'
  order by m.user_id, s.created_at
) ps
where t.id in (select id from public._contributions_backup) and t.contributor_id = ps.user_id and t.space_id <> ps.id;

-- unknown person: it comes from the shared space's own cash (same effect on the receiving account)
-- (check_tx_refs already turns any contribution it touches into a transfer and gives it the space's cash)
update public.transactions t set kind = 'transfer', account_id = public.cash_account(t.space_id)
where t.id in (select id from public._contributions_backup) and t.contributor_id is null;

update public.recurring set kind = 'transfer' where kind = 'contribution';
