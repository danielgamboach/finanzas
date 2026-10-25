-- New-user onboarding: a short setup the first time someone enters, then a "Primeros pasos" checklist on Inicio.
-- Existing people already went through it (they set everything up by hand), so they never see either.
alter table public.profiles
  add column if not exists onboarded_at timestamptz,
  add column if not exists setup_hidden boolean not null default false;

update public.profiles set onboarded_at = coalesce(onboarded_at, created_at, now()), setup_hidden = true;
