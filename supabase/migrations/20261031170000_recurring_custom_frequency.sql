-- Frecuencia personalizada de recurrentes ("cada N días, semanas o meses", REC-01).
alter table public.recurring add column if not exists every_n smallint;
alter table public.recurring add column if not exists every_unit text;
alter table public.recurring drop constraint recurring_frequency_check;
alter table public.recurring add constraint recurring_frequency_check check (frequency = any (array['weekly','biweekly','monthly','bimonthly','quarterly','semiannual','yearly','custom']));
alter table public.recurring add constraint recurring_custom_check check (
  (frequency <> 'custom') or (every_n between 1 and 366 and every_unit in ('day','week','month'))
);
