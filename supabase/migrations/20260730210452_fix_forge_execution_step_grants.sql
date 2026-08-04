-- Corrige uniquement les privilèges de la table de preuves d'exécution.

revoke all on table public.forge_execution_steps
  from public, anon, authenticated, service_role;
grant select on table public.forge_execution_steps to authenticated;
grant select, insert, update, delete on table public.forge_execution_steps
  to service_role;

revoke all on sequence public.forge_execution_steps_id_seq
  from public, anon, authenticated, service_role;
grant usage, select on sequence public.forge_execution_steps_id_seq
  to service_role;
