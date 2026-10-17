create extension if not exists pg_net;

alter table public.transactions add column ai_checked_at timestamptz;

-- When a movement arrives without a category, ask the categorize function (async, never blocks the insert).
create or replace function public.queue_ai_categorization() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.category_id is null and new.kind in ('expense','income','refund') and new.ai_checked_at is null then
    perform net.http_post(
      url := 'https://vzgnujopgryuskixcnnx.supabase.co/functions/v1/categorize',
      body := jsonb_build_object('tx_ids', jsonb_build_array(new.id)),
      headers := jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 20000
    );
  end if;
  return new;
end $$;
revoke execute on function public.queue_ai_categorization() from public, anon, authenticated;
create trigger transactions_ai_categorize after insert on public.transactions
  for each row execute function public.queue_ai_categorization();
