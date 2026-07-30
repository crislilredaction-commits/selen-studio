-- La Forge est strictement réservée aux profils Studio administrateurs actifs.

create or replace function public.forge_current_access_level()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case when exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role = 'admin'
      and (
        ap.user_id = (select auth.uid())
        or lower(ap.email) = lower((select auth.jwt()) ->> 'email')
      )
  ) then 'admin' else 'none' end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'forge_missions', 'forge_activity_logs', 'forge_validation_items',
    'forge_corrections', 'forge_mission_reports', 'forge_mission_briefs',
    'forge_mission_plans', 'forge_mission_checkpoints',
    'forge_mission_checkpoint_history', 'forge_mission_incidents',
    'forge_mission_incident_attempts', 'forge_mission_plan_actions',
    'forge_human_instructions', 'forge_human_decisions'
  ] loop
    execute format(
      'drop policy if exists %I on public.%I',
      'Forge authorized users can read',
      table_name
    );
    execute format(
      'drop policy if exists %I on public.%I',
      'Forge admins can read',
      table_name
    );
    execute format(
      'create policy %I on public.%I for select to authenticated using (coalesce(public.forge_current_access_level(), ''none'') = ''admin'')',
      'Forge admins can read',
      table_name
    );
  end loop;
end
$$;

drop policy if exists "Studio staff can read Forge alerts"
  on public.forge_alerts;
drop policy if exists "Studio admins can read Forge alerts"
  on public.forge_alerts;
create policy "Studio admins can read Forge alerts"
on public.forge_alerts for select to authenticated
using (public.forge_current_access_level() = 'admin');

drop policy if exists "Studio staff can read Forge alert events"
  on public.forge_alert_events;
drop policy if exists "Studio admins can read Forge alert events"
  on public.forge_alert_events;
create policy "Studio admins can read Forge alert events"
on public.forge_alert_events for select to authenticated
using (public.forge_current_access_level() = 'admin');

revoke all on function public.forge_current_access_level()
  from public, anon;
grant execute on function public.forge_current_access_level()
  to authenticated;
