-- Synchronisation de la decision humaine avec incidents et checkpoints.

create or replace function public.forge_validate_mission_plan(p_mission_id uuid,p_plan_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare blocking_count integer; current_version integer;
begin
  select jsonb_array_length(blocking_questions),version into blocking_count,current_version
  from public.forge_mission_plans
  where id=p_plan_id and mission_id=p_mission_id and is_current=true
    and status in ('draft','needs_clarification','plan_ready') for update;
  if current_version is null then raise exception 'La version precise doit etre courante et non validee'; end if;
  if blocking_count>0 then raise exception 'Les questions bloquantes doivent etre resolues'; end if;
  update public.forge_mission_checkpoints set status='in_progress',message='Version courante generee'
  where mission_id=p_mission_id and checkpoint_key='plan_generated' and status in ('pending','failed');
  update public.forge_mission_checkpoints set status='completed',message='Version courante generee'
  where mission_id=p_mission_id and checkpoint_key='plan_generated' and status='in_progress';
  update public.forge_mission_plans set status='validated',validated_by=(select auth.uid()),validated_at=now()
  where id=p_plan_id;
  update public.forge_mission_incidents set resolution_status='resolved',resolved_at=now(),
    correction_strategy='manual_resolution',updated_at=now()
  where mission_id=p_mission_id and current_plan_id=p_plan_id
    and resolution_status in ('blocked','detected');
  update public.forge_missions set status='plan_validated',planning_validated_at=now(),
    execution_plan_id=p_plan_id where id=p_mission_id and planning_required=true;
  insert into public.forge_activity_logs(mission_id,event_type,message,metadata)
  values(p_mission_id,'plan_validated','Nouvelle version validee explicitement; reprise autorisee',
    jsonb_build_object('status','plan_validated','plan_id',p_plan_id,'version',current_version,'revalidation',true));
end $$;

create or replace function public.forge_reject_current_plan(p_mission_id uuid,p_plan_id uuid,p_reason text)
returns void language plpgsql security invoker set search_path='' as $$
declare previous_id uuid;
begin
  select previous_plan_id into previous_id from public.forge_mission_plans
  where id=p_plan_id and mission_id=p_mission_id and is_current=true and status<>'validated' for update;
  if previous_id is null or length(trim(coalesce(p_reason,'')))=0 then
    raise exception 'Le refus exige une version remplaçante et une justification';
  end if;
  update public.forge_mission_plans set is_current=false,status='rejected',
    rejected_at=now(),rejected_by=(select auth.uid()) where id=p_plan_id;
  update public.forge_mission_plans set is_current=true where id=previous_id and status='validated';
  if not found then raise exception 'Le plan precedent valide est introuvable'; end if;
  update public.forge_mission_incidents set resolution_status='resolved',resolved_at=now(),
    correction_strategy='manual_resolution',updated_at=now()
  where mission_id=p_mission_id and current_plan_id=p_plan_id
    and resolution_status in ('blocked','detected');
  update public.forge_mission_checkpoints set status='in_progress',message='Plan precedent restaure'
  where mission_id=p_mission_id and checkpoint_key='plan_generated' and status in ('pending','failed');
  update public.forge_mission_checkpoints set status='completed',message='Plan precedent restaure'
  where mission_id=p_mission_id and checkpoint_key='plan_generated' and status='in_progress';
  update public.forge_missions set execution_plan_id=previous_id,status='plan_validated',
    planning_validated_at=now() where id=p_mission_id;
  insert into public.forge_activity_logs(mission_id,event_type,message,metadata)
  values(p_mission_id,'plan_reopened','Nouvelle version refusee; plan valide precedent restaure',
    jsonb_build_object('rejected_plan_id',p_plan_id,'restored_plan_id',previous_id,'reason',trim(p_reason)));
end $$;

revoke all on function public.forge_validate_mission_plan(uuid,uuid) from public,anon;
grant execute on function public.forge_validate_mission_plan(uuid,uuid) to authenticated;
revoke all on function public.forge_reject_current_plan(uuid,uuid,text) from public,anon;
grant execute on function public.forge_reject_current_plan(uuid,uuid,text) to authenticated;
