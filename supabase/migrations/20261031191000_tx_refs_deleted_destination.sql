-- La cuenta destino de un movimiento puede desaparecer mientras se borra su espacio (ESP-04): el movimiento
-- se queda con su origen y sin destino.
create or replace function public.check_tx_refs() returns trigger
language plpgsql security definer set search_path = public as $$
declare src text; dst record; touched boolean;
begin
  if new.kind = 'contribution' then new.kind := 'transfer'; end if;
  if new.category_id is not null and not exists (select 1 from public.categories c where c.id = new.category_id and c.space_id = new.space_id) then
    raise exception 'category does not belong to space';
  end if;
  if new.account_id is null then new.account_id := public.cash_account(new.space_id); end if;
  select kind into src from public.accounts a where a.id = new.account_id and a.space_id = new.space_id;
  if src is null then raise exception 'account does not belong to space'; end if;

  if new.kind = 'transfer' then
    if new.to_account_id is not null then
      select id, space_id, kind into dst from public.accounts where id = new.to_account_id;
      -- the destination's space is being deleted: the transfer keeps its origin
      if dst.id is null and tg_op = 'UPDATE' then new.to_account_id := null; end if;
    end if;
    if new.to_account_id is null then
      if not (tg_op = 'UPDATE' and old.to_account_id is not null) then raise exception 'Elegí a qué cuenta va el dinero'; end if;
      new.to_space_id := null;
    else
      if dst.id is null then raise exception 'destination account not found'; end if;
      if new.to_account_id = new.account_id then raise exception 'La cuenta de origen y la de destino son la misma'; end if;
      if dst.space_id <> new.space_id and auth.uid() is not null and not public.is_space_member(dst.space_id) then
        raise exception 'destination account not available';
      end if;
      new.to_space_id := case when dst.space_id <> new.space_id then dst.space_id end;
    end if;
  else
    new.to_account_id := null;
    new.to_space_id := null;
  end if;

  touched := tg_op = 'INSERT' or new.kind is distinct from old.kind or new.account_id is distinct from old.account_id
    or new.to_account_id is distinct from old.to_account_id;
  if touched then
    if new.kind = 'expense' and src in ('cdp', 'investment', 'loan') then raise exception 'Esta cuenta no sirve para pagar gastos'; end if;
    if new.kind = 'refund' and src in ('cdp', 'investment', 'loan') then raise exception 'Esta cuenta no recibe devoluciones'; end if;
    if new.kind = 'income' and src in ('credit_card', 'loan') then raise exception 'Esta cuenta no recibe ingresos'; end if;
    if new.kind = 'transfer' and src in ('credit_card', 'loan') then raise exception 'De esta cuenta no puede salir dinero'; end if;
  end if;

  if new.currency = 'CRC' then new.fx_rate := 1; end if;
  return new;
end $$;
