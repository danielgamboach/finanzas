create or replace function public.current_fx(d date default current_date) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select crc_per_usd from public.fx_rates where rate_date <= d order by rate_date desc limit 1), 460);
$$;

create or replace function public.seed_space_defaults(p_space uuid, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
declare cat record;
begin
  if p_kind = 'shared' then
    insert into public.categories (space_id, name, emoji, color, kind, is_fixed, sort) values
      (p_space,'Súper','🛒','mint','expense',false,1),
      (p_space,'Restaurantes','🍽️','peach','expense',false,2),
      (p_space,'Delivery','🛵','pink','expense',false,3),
      (p_space,'Transporte','🚕','sky','expense',false,4),
      (p_space,'Gasolina','⛽','butter','expense',false,5),
      (p_space,'Casita','🪴','lilac','expense',false,6),
      (p_space,'Alquiler','🔑','gray','expense',true,7),
      (p_space,'Servicios','💡','butter','expense',true,8),
      (p_space,'Entretenimiento','🎬','lilac','expense',false,9),
      (p_space,'Salud','💊','pink','expense',false,10),
      (p_space,'Suscripciones','📺','pink','expense',true,11),
      (p_space,'Otros','✨','gray','expense',false,12),
      (p_space,'Otro ingreso','💰','mint','income',false,20);
  else
    insert into public.categories (space_id, name, emoji, color, kind, is_fixed, sort) values
      (p_space,'Súper','🛒','mint','expense',false,1),
      (p_space,'Restaurantes','🍽️','peach','expense',false,2),
      (p_space,'Salidas','☕','peach','expense',false,3),
      (p_space,'Transporte','🚕','sky','expense',false,4),
      (p_space,'Ropa','👕','lilac','expense',false,5),
      (p_space,'Salud','💊','pink','expense',false,6),
      (p_space,'Suscripciones','📺','pink','expense',true,7),
      (p_space,'Entretenimiento','🎬','lilac','expense',false,8),
      (p_space,'Otros','✨','gray','expense',false,9),
      (p_space,'Salario','💼','mint','income',false,20),
      (p_space,'Freelance','💻','sky','income',false,21),
      (p_space,'Reintegro','↩️','butter','income',false,22),
      (p_space,'Otro ingreso','💰','mint','income',false,23);
  end if;

  -- merchant rules (only for categories that exist in this space)
  insert into public.merchant_rules (space_id, pattern, category_id, priority)
  select p_space, r.pattern, c.id, r.priority
  from (values
    ('AUTO MERCADO','Súper',10),('FRESH MARKET','Súper',10),('MXM','Súper',10),('MAS X MENOS','Súper',10),
    ('WALMART','Súper',10),('MAXI PALI','Súper',10),('PALI','Súper',5),('GESSA','Súper',10),('SARETTO','Súper',10),
    ('PRICESMART','Súper',10),('MINISUPER','Súper',5),('MINI SUPER','Súper',5),('FM SJ','Súper',5),
    ('UE COSTA RICA','Delivery',20),('UBER EATS','Delivery',20),('RAPPI','Delivery',15),('DIDI FOOD','Delivery',15),
    ('UBER','Transporte',10),('DIDI','Transporte',5),
    ('DELTA','Gasolina',10),('SERVICENTRO','Gasolina',10),('GASOLINERA','Gasolina',10),('UNO ','Gasolina',2),
    ('FERRETERIA','Casita',10),('EPA','Casita',8),('PEQUENO MUNDO','Casita',10),('ALISS','Casita',10),('IKEA','Casita',10),
    ('CINE','Entretenimiento',10),('SALA GARBO','Entretenimiento',10),('TEATRO','Entretenimiento',5),('ESPACIO ESCENIC','Entretenimiento',10),
    ('FARMACIA','Salud',10),('FISCHEL','Salud',10),('SUCRE','Salud',10),
    ('APPLE.COM','Suscripciones',10),('NETFLIX','Suscripciones',10),('SPOTIFY','Suscripciones',10),('DISNEY','Suscripciones',10),
    ('CNFL','Servicios',10),('AYA','Servicios',5),('KOLBI','Servicios',10),('LIBERTY','Servicios',10),('TIGO','Servicios',10)
  ) as r(pattern, cat_name, priority)
  join public.categories c on c.space_id = p_space and c.name = r.cat_name
  on conflict do nothing;
end $$;

create or replace function public.create_space(p_name text, p_emoji text, p_kind text) returns uuid
language plpgsql security definer set search_path = public as $$
declare s uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.spaces (name, emoji, kind, created_by) values (p_name, coalesce(p_emoji,'👤'), p_kind, auth.uid()) returning id into s;
  insert into public.space_members (space_id, user_id, role) values (s, auth.uid(), 'owner');
  perform public.seed_space_defaults(s, p_kind);
  return s;
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare s uuid;
begin
  insert into public.profiles (id, name) values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)))
  on conflict do nothing;
  insert into public.spaces (name, emoji, kind, created_by) values ('Personal','👤','personal', new.id) returning id into s;
  insert into public.space_members (space_id, user_id, role) values (s, new.id, 'owner');
  perform public.seed_space_defaults(s, 'personal');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.create_invite(p_space uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_space_owner(p_space) then raise exception 'only owners can invite'; end if;
  insert into public.space_invites (space_id, created_by) values (p_space, auth.uid()) returning code into c;
  return c;
end $$;

create or replace function public.accept_invite(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv record;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into inv from public.space_invites where code = lower(trim(p_code)) and used_at is null and created_at > now() - interval '14 days';
  if inv is null then raise exception 'invite not valid'; end if;
  insert into public.space_members (space_id, user_id, role) values (inv.space_id, auth.uid(), 'member') on conflict do nothing;
  update public.space_invites set used_by = auth.uid(), used_at = now() where code = inv.code;
  return inv.space_id;
end $$;

create or replace function public.create_ingest_token(p_label text default 'Google Apps Script') returns text
language plpgsql security definer set search_path = public, extensions as $$
declare t text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  t := 'fin_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.ingest_tokens (token_hash, user_id, label) values (encode(extensions.digest(t, 'sha256'), 'hex'), auth.uid(), p_label);
  return t;
end $$;

create or replace function public.match_category(p_space uuid, p_merchant text) returns uuid
language sql stable security definer set search_path = public as $$
  select r.category_id from public.merchant_rules r
  where r.space_id = p_space and upper(coalesce(p_merchant,'')) like '%' || upper(r.pattern) || '%'
  order by r.priority desc, length(r.pattern) desc limit 1;
$$;

-- apply a rule to past uncategorized / review rows and save it
create or replace function public.save_rule_and_apply(p_space uuid, p_pattern text, p_category uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_space_member(p_space) then raise exception 'forbidden'; end if;
  insert into public.merchant_rules (space_id, pattern, category_id, priority) values (p_space, upper(trim(p_pattern)), p_category, 50)
  on conflict (space_id, pattern) do update set category_id = excluded.category_id;
  update public.transactions set category_id = p_category, status = 'posted'
  where space_id = p_space and upper(coalesce(raw_merchant, merchant, '')) like '%' || upper(trim(p_pattern)) || '%'
    and (category_id is null or status = 'review');
  get diagnostics n = row_count;
  return n;
end $$;
