create or replace function public.is_space_member(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.space_members where space_id = s and user_id = auth.uid());
$$;

create or replace function public.is_space_owner(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.space_members where space_id = s and user_id = auth.uid() and role = 'owner');
$$;

alter table public.profiles enable row level security;
alter table public.spaces enable row level security;
alter table public.space_members enable row level security;
alter table public.space_invites enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.tags enable row level security;
alter table public.recurring enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_tags enable row level security;
alter table public.merchant_rules enable row level security;
alter table public.goals enable row level security;
alter table public.goal_accounts enable row level security;
alter table public.balance_snapshots enable row level security;
alter table public.fx_rates enable row level security;
alter table public.ingest_tokens enable row level security;
alter table public.ingest_unmatched enable row level security;

-- profiles: self, plus people you share a space with
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from public.space_members a join public.space_members b on a.space_id = b.space_id
    where a.user_id = auth.uid() and b.user_id = profiles.id)
);
create policy profiles_upsert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy spaces_select on public.spaces for select to authenticated using (public.is_space_member(id));
create policy spaces_update on public.spaces for update to authenticated using (public.is_space_owner(id)) with check (public.is_space_owner(id));
create policy spaces_delete on public.spaces for delete to authenticated using (public.is_space_owner(id));

create policy members_select on public.space_members for select to authenticated using (public.is_space_member(space_id));
create policy members_delete on public.space_members for delete to authenticated using (public.is_space_owner(space_id) or user_id = auth.uid());

create policy invites_select on public.space_invites for select to authenticated using (public.is_space_owner(space_id));
create policy invites_delete on public.space_invites for delete to authenticated using (public.is_space_owner(space_id));

-- generic space-scoped tables
do $$
declare t text;
begin
  foreach t in array array['accounts','categories','tags','recurring','transactions','merchant_rules','goals'] loop
    execute format('create policy %1$s_all on public.%1$s for all to authenticated using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));', t);
  end loop;
end $$;

create policy tx_tags_all on public.transaction_tags for all to authenticated
  using (exists (select 1 from public.transactions t where t.id = transaction_id and public.is_space_member(t.space_id)))
  with check (exists (select 1 from public.transactions t join public.tags g on g.id = tag_id
                      where t.id = transaction_id and g.space_id = t.space_id and public.is_space_member(t.space_id)));

create policy goal_accounts_all on public.goal_accounts for all to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id and public.is_space_member(g.space_id)))
  with check (exists (select 1 from public.goals g join public.accounts a on a.id = account_id
                      where g.id = goal_id and a.space_id = g.space_id and public.is_space_member(g.space_id)));

create policy snapshots_all on public.balance_snapshots for all to authenticated
  using (exists (select 1 from public.accounts a where a.id = account_id and public.is_space_member(a.space_id)))
  with check (exists (select 1 from public.accounts a where a.id = account_id and public.is_space_member(a.space_id)));

create policy fx_select on public.fx_rates for select to authenticated using (true);

create policy tokens_select on public.ingest_tokens for select to authenticated using (user_id = auth.uid());
create policy tokens_delete on public.ingest_tokens for delete to authenticated using (user_id = auth.uid());

create policy unmatched_select on public.ingest_unmatched for select to authenticated using (user_id = auth.uid());
create policy unmatched_delete on public.ingest_unmatched for delete to authenticated using (user_id = auth.uid());

-- keep updated_at fresh
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
create trigger transactions_touch before update on public.transactions for each row execute function public.touch_updated_at();

-- tx integrity: category/account must belong to same space
create or replace function public.check_tx_refs() returns trigger language plpgsql set search_path = public as $$
begin
  if new.category_id is not null and not exists (select 1 from public.categories c where c.id = new.category_id and c.space_id = new.space_id) then
    raise exception 'category does not belong to space';
  end if;
  if new.account_id is not null and not exists (select 1 from public.accounts a where a.id = new.account_id and a.space_id = new.space_id) then
    raise exception 'account does not belong to space';
  end if;
  if new.currency = 'CRC' then new.fx_rate := 1; end if;
  return new;
end $$;
create trigger transactions_refs before insert or update on public.transactions for each row execute function public.check_tx_refs();
