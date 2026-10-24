-- The merchant link is set by triggers only: nobody calls these through the API.
alter function public.set_tx_merchant() security definer;
revoke execute on function public.resolve_merchant(text, text) from public, anon, authenticated;
revoke execute on function public.merchant_patterns_changed() from public, anon, authenticated;
revoke execute on function public.set_tx_merchant() from public, anon, authenticated;
