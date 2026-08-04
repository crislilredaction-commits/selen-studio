-- Le garde-fou reste invoker et refuse tout profil autre qu admin.

revoke all on function public.forge_require_admin() from public, anon;
grant execute on function public.forge_require_admin() to authenticated;
