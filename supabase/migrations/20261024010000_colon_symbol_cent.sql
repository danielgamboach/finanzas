-- In Costa Rica people write colones with ¢; notifications use it too.
create or replace function public.crc_text(v numeric) returns text
language sql immutable set search_path = public as $$
  select '¢' || replace(to_char(round(v), 'FM999,999,999,999'), ',', '.');
$$;
