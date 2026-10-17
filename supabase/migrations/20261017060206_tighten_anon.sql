revoke execute on function public.is_space_member(uuid) from public, anon;
revoke execute on function public.is_space_owner(uuid) from public, anon;
revoke execute on function public.current_fx(date) from public, anon;
grant execute on function public.is_space_member(uuid) to authenticated;
grant execute on function public.is_space_owner(uuid) to authenticated;
grant execute on function public.current_fx(date) to authenticated;
