-- PPT-02: a fixed line that groups a category's recurrents can take its amount from them, month by month.
alter table public.envelopes add column if not exists amount_auto boolean not null default false;
