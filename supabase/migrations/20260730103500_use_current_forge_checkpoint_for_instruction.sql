-- Une consigne sensible est rattachee au checkpoint en cours ou au premier incomplet.

create or replace function public.forge_add_human_instruction(
  p_mission_id uuid,
  p_content text,
  p_sensitivity text default 'minor',
  p_incident_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  instruction_id uuid;
  current_plan_id uuid;
  current_checkpoint_key text;
begin
  perform public.forge_require_admin();
  if p_sensitivity not in ('minor', 'sensitive') then
    raise exception 'Sensibilite de consigne invalide';
  end if;
  if length(trim(coalesce(p_content, ''))) < 3 then
    raise exception 'Une consigne explicite est obligatoire';
  end if;
  if p_incident_id is not null and not exists (
    select 1 from public.forge_mission_incidents
    where id = p_incident_id and mission_id = p_mission_id
  ) then
    raise exception 'Incident incompatible avec la mission';
  end if;
  select id into current_plan_id
  from public.forge_mission_plans
  where mission_id = p_mission_id and is_current = true;
  insert into public.forge_human_instructions(
    mission_id, incident_id, plan_id, content, sensitivity, created_by
  ) values (
    p_mission_id, p_incident_id, current_plan_id, trim(p_content),
    p_sensitivity, (select auth.uid())
  ) returning id into instruction_id;
  if p_sensitivity = 'sensitive' then
    select checkpoint_key into current_checkpoint_key
    from public.forge_mission_checkpoints
    where mission_id = p_mission_id
      and status not in ('completed', 'skipped')
    order by case when status = 'in_progress' then 0 else 1 end, position
    limit 1;
    if current_checkpoint_key is null then
      raise exception 'Aucun checkpoint actif ne peut recevoir la consigne';
    end if;
    perform public.forge_record_plan_action(
      p_mission_id,
      current_checkpoint_key,
      'human_instruction',
      'sensitive',
      'functional_scope',
      'Une consigne humaine modifie sensiblement le plan',
      jsonb_build_array('consigne Studio', instruction_id),
      trim(p_content),
      'Consigne ajoutee depuis le centre de pilotage humain',
      'Le plan courant doit integrer la consigne puis etre revalide'
    );
  else
    insert into public.forge_activity_logs(mission_id, event_type, message, metadata)
    values (
      p_mission_id, 'correction', 'Consigne humaine ajoutee',
      jsonb_build_object('instruction_id', instruction_id, 'sensitivity', 'minor')
    );
  end if;
  return instruction_id;
end
$$;

revoke all on function public.forge_add_human_instruction(uuid,text,text,uuid)
  from public, anon;
grant execute on function public.forge_add_human_instruction(uuid,text,text,uuid)
  to authenticated;
