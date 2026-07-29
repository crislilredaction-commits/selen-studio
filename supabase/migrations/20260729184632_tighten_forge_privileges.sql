-- Restreint les privilèges Forge hérités des default privileges Supabase.
-- Aucun objet ni aucune donnée métier ne sont modifiés.

revoke all
  on table public.forge_missions,
           public.forge_activity_logs,
           public.forge_validation_items,
           public.forge_corrections
  from anon, authenticated;

grant select, insert, update, delete
  on table public.forge_missions,
           public.forge_activity_logs,
           public.forge_validation_items,
           public.forge_corrections
  to authenticated;

revoke all on function public.set_forge_updated_at()
  from public, anon, authenticated;
