-- Merchant photos: a small square picture per merchant, shown instead of the category emoji.
-- A photo applies to every movement whose merchant contains `pattern` (whole words, accents and case ignored).
-- Images are resized in the app to 192px JPEG (~10 KB) and kept in a public bucket under <space_id>/.

create table if not exists public.merchant_photos (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces on delete cascade,
  pattern text not null,
  path text not null,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  unique (space_id, pattern)
);
alter table public.merchant_photos enable row level security;
create policy "members manage merchant photos" on public.merchant_photos for all to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));
grant select, insert, update, delete on public.merchant_photos to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('merchant-photos', 'merchant-photos', true, 262144, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Only members of the space in the first folder can write there.
create policy "merchant photos: members upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'merchant-photos' and public.is_space_member(((storage.foldername(name))[1])::uuid));
create policy "merchant photos: members update" on storage.objects for update to authenticated
  using (bucket_id = 'merchant-photos' and public.is_space_member(((storage.foldername(name))[1])::uuid));
create policy "merchant photos: members delete" on storage.objects for delete to authenticated
  using (bucket_id = 'merchant-photos' and public.is_space_member(((storage.foldername(name))[1])::uuid));
create policy "merchant photos: members read" on storage.objects for select to authenticated
  using (bucket_id = 'merchant-photos' and public.is_space_member(((storage.foldername(name))[1])::uuid));
