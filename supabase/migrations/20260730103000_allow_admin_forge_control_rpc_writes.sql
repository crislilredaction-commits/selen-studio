-- Privileges minimaux requis par les RPC security invoker.
-- La RLS limite toujours toute ecriture au niveau d acces admin.

grant insert on public.forge_mission_checkpoint_history to authenticated;
grant insert, update on public.forge_mission_incidents to authenticated;
grant insert on public.forge_mission_incident_attempts to authenticated;
grant insert on public.forge_mission_plan_actions to authenticated;
