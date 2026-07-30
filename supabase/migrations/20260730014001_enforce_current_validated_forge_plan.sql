-- Execution strictement liee au plan courant valide et revalidation sensible.

alter table public.forge_mission_plans
  add column previous_plan_id uuid references public.forge_mission_plans(id) on delete restrict,
  add column change_justification text,
  add column difference_summary text,
  add column revalidation_reason text,
  add column rejected_at timestamptz,
  add column rejected_by uuid references auth.users(id) on delete set null;

alter table public.forge_mission_plans
  drop constraint forge_mission_plans_status_check;
alter table public.forge_mission_plans
  add constraint forge_mission_plans_status_check check (
    status in (
      'draft', 'needs_clarification', 'plan_ready', 'validated',
      'superseded', 'failed', 'rejected'
    )
  );
alter table public.forge_mission_plans
  add constraint forge_mission_plans_change_metadata_check check (
    previous_plan_id is null
    or (
      length(trim(coalesce(change_justification, ''))) > 0
      and length(trim(coalesce(difference_summary, ''))) > 0
      and length(trim(coalesce(revalidation_reason, ''))) > 0
    )
  );

alter table public.forge_missions
  add column execution_plan_id uuid references public.forge_mission_plans(id) on delete restrict;

alter table public.forge_mission_incidents
  add column expected_plan_id uuid references public.forge_mission_plans(id) on delete restrict,
  add column current_plan_id uuid references public.forge_mission_plans(id) on delete restrict;

create table public.forge_mission_plan_actions (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.forge_missions(id) on delete cascade,
  plan_id uuid not null references public.forge_mission_plans(id) on delete restrict,
  checkpoint_id uuid not null references public.forge_mission_checkpoints(id) on delete restrict,
  action_key text not null,
  sensitivity text not null,
  change_type text not null,
  summary text not null,
  affected_objects jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint forge_plan_actions_sensitivity_check check (
    sensitivity in ('minor_technical', 'sensitive')
  ),
  constraint forge_plan_actions_change_type_check check (
    change_type in (
      'technical_fix', 'functional_scope', 'module_change', 'business_rule',
      'architecture', 'major_dependency', 'unplanned_migration',
      'substantial_migration_change', 'data_schema', 'rls_or_grants',
      'authentication_or_authorization', 'important_api',
      'compatibility', 'unplanned_remote_action', 'data_risk',
      'technical_constraint', 'test_or_deployment_strategy',
      'out_of_scope'
    )
  ),
  constraint forge_plan_actions_summary_check check (length(trim(summary)) > 0)
);
create index forge_mission_plan_actions_mission_created_idx
  on public.forge_mission_plan_actions(mission_id, created_at desc);

alter table public.forge_mission_plan_actions enable row level security;
revoke all on table public.forge_mission_plan_actions from anon, authenticated;
grant select on table public.forge_mission_plan_actions to authenticated;
create policy "Studio staff can read Forge plan actions"
on public.forge_mission_plan_actions for select to authenticated
using (exists (
  select 1 from public.agent_profiles ap
  where ap.is_active = true and ap.role in ('agent', 'admin')
    and (ap.user_id = (select auth.uid())
      or lower(ap.email) = lower((select auth.jwt()) ->> 'email'))
));

create or replace function public.prepare_forge_plan_version_metadata()
returns trigger language plpgsql security invoker set search_path='' as $$
declare previous public.forge_mission_plans%rowtype; changed text[] := array[]::text[];
begin
  if new.version=1 then return new; end if;
  select * into previous from public.forge_mission_plans
  where mission_id=new.mission_id and version<new.version order by version desc limit 1;
  if previous.id is null then raise exception 'La version precedente est introuvable'; end if;
  if new.proposed_title is distinct from previous.proposed_title then changed:=array_append(changed,'titre'); end if;
  if new.summary is distinct from previous.summary then changed:=array_append(changed,'resume'); end if;
  if new.functional_objective is distinct from previous.functional_objective then changed:=array_append(changed,'objectif fonctionnel'); end if;
  if new.included_scope is distinct from previous.included_scope or new.excluded_scope is distinct from previous.excluded_scope then changed:=array_append(changed,'perimetre'); end if;
  if new.repository_areas is distinct from previous.repository_areas then changed:=array_append(changed,'zones du depot'); end if;
  if new.technical_dependencies is distinct from previous.technical_dependencies then changed:=array_append(changed,'dependances'); end if;
  if new.execution_steps is distinct from previous.execution_steps then changed:=array_append(changed,'etapes'); end if;
  if new.verification_plan is distinct from previous.verification_plan then changed:=array_append(changed,'strategie de verification'); end if;
  new.previous_plan_id:=coalesce(new.previous_plan_id,previous.id);
  new.change_justification:=coalesce(nullif(trim(new.change_justification),''),'Nouvelle version creee sans ecraser la precedente');
  new.difference_summary:=coalesce(nullif(trim(new.difference_summary),''),
    case when cardinality(changed)=0 then 'Aucun ecart de contenu structure detecte' else 'Champs modifies : '||array_to_string(changed,', ') end);
  new.revalidation_reason:=coalesce(nullif(trim(new.revalidation_reason),''),
    'Toute nouvelle version courante exige une validation humaine explicite');
  return new;
end $$;
create trigger forge_mission_plans_prepare_version_metadata
before insert on public.forge_mission_plans
for each row execute function public.prepare_forge_plan_version_metadata();

create or replace function public.protect_validated_forge_mission_plan()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'Une version de cadrage ne peut pas etre supprimee'; end if;
  if new.mission_id is distinct from old.mission_id
    or new.version is distinct from old.version
    or new.proposed_title is distinct from old.proposed_title
    or new.summary is distinct from old.summary
    or new.functional_objective is distinct from old.functional_objective
    or new.included_scope is distinct from old.included_scope
    or new.excluded_scope is distinct from old.excluded_scope
    or new.constraints is distinct from old.constraints
    or new.repository_areas is distinct from old.repository_areas
    or new.technical_dependencies is distinct from old.technical_dependencies
    or new.risks is distinct from old.risks
    or new.blocking_questions is distinct from old.blocking_questions
    or new.non_blocking_questions is distinct from old.non_blocking_questions
    or new.assumptions is distinct from old.assumptions
    or new.recommendations is distinct from old.recommendations
    or new.acceptance_criteria is distinct from old.acceptance_criteria
    or new.execution_steps is distinct from old.execution_steps
    or new.verification_plan is distinct from old.verification_plan
    or new.markdown_content is distinct from old.markdown_content
    or new.previous_plan_id is distinct from old.previous_plan_id
    or new.change_justification is distinct from old.change_justification
    or new.difference_summary is distinct from old.difference_summary
    or new.revalidation_reason is distinct from old.revalidation_reason
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'Le contenu et les metadonnees d une version sont immuables';
  end if;
  return new;
end $$;

create or replace function public.enforce_forge_mission_planning_gate()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare current_validated_plan uuid;
begin
  if new.planning_required = true
    and new.status in (
      'ready', 'in_progress', 'paused', 'deployed', 'to_review',
      'changes_requested', 'validated'
    ) then
    select id into current_validated_plan
    from public.forge_mission_plans
    where mission_id = new.id and is_current = true and status = 'validated';
    if current_validated_plan is null
      or new.execution_plan_id is distinct from current_validated_plan then
      raise exception 'Le plan courant valide et explicitement lie a l execution est requis';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.forge_validate_mission_plan(
  p_mission_id uuid,
  p_plan_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare blocking_count integer; current_version integer;
begin
  select jsonb_array_length(blocking_questions), version
  into blocking_count, current_version
  from public.forge_mission_plans
  where id = p_plan_id and mission_id = p_mission_id and is_current = true
    and status in ('draft', 'needs_clarification', 'plan_ready')
  for update;
  if current_version is null then
    raise exception 'La version precise a valider doit etre la version courante non validee';
  end if;
  if blocking_count > 0 then
    raise exception 'Les questions bloquantes doivent etre resolues';
  end if;
  update public.forge_mission_plans
  set status='validated', validated_by=(select auth.uid()), validated_at=now()
  where id=p_plan_id;
  update public.forge_missions
  set status='plan_validated', planning_validated_at=now(), execution_plan_id=p_plan_id
  where id=p_mission_id and planning_required=true;
  insert into public.forge_activity_logs(mission_id,event_type,message,metadata)
  values(p_mission_id,'plan_validated','Version courante du cadrage validee explicitement',
    jsonb_build_object('status','plan_validated','plan_id',p_plan_id,'version',current_version));
end;
$$;

create or replace function public.forge_record_plan_action(
  p_mission_id uuid,
  p_checkpoint_key text,
  p_action_key text,
  p_sensitivity text,
  p_change_type text,
  p_summary text,
  p_affected_objects jsonb default '[]'::jsonb,
  p_change_justification text default null,
  p_difference_summary text default null,
  p_revalidation_reason text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare current_plan public.forge_mission_plans%rowtype;
  checkpoint_id uuid; action_id uuid; new_plan_id uuid; next_version integer; incident_id uuid;
begin
  select * into current_plan from public.forge_mission_plans
  where mission_id=p_mission_id and is_current=true and status='validated' for update;
  select id into checkpoint_id from public.forge_mission_checkpoints
  where mission_id=p_mission_id and checkpoint_key=p_checkpoint_key;
  if current_plan.id is null or checkpoint_id is null then
    raise exception 'Une action exige le plan courant valide et un checkpoint existant';
  end if;
  if (select execution_plan_id from public.forge_missions where id=p_mission_id)
    is distinct from current_plan.id then
    raise exception 'La mission n est pas liee a la version courante validee';
  end if;
  insert into public.forge_mission_plan_actions(
    mission_id,plan_id,checkpoint_id,action_key,sensitivity,change_type,
    summary,affected_objects,created_by
  ) values (
    p_mission_id,current_plan.id,checkpoint_id,trim(p_action_key),
    p_sensitivity,p_change_type,trim(p_summary),coalesce(p_affected_objects,'[]'),(select auth.uid())
  ) returning id into action_id;
  if p_sensitivity='minor_technical' then
    if p_change_type<>'technical_fix' then
      raise exception 'Seule une correction technique sans effet fonctionnel peut etre mineure';
    end if;
    insert into public.forge_activity_logs(mission_id,event_type,message,metadata)
    values(p_mission_id,'correction',trim(p_summary),
      jsonb_build_object('plan_id',current_plan.id,'plan_action_id',action_id,'sensitivity','minor_technical'));
    return action_id;
  end if;
  if length(trim(coalesce(p_change_justification,'')))=0
    or length(trim(coalesce(p_difference_summary,'')))=0
    or length(trim(coalesce(p_revalidation_reason,'')))=0 then
    raise exception 'Un changement sensible exige justification, differences et raison de revalidation';
  end if;
  select coalesce(max(version),0)+1 into next_version
  from public.forge_mission_plans where mission_id=p_mission_id;
  update public.forge_mission_plans set is_current=false where id=current_plan.id;
  insert into public.forge_mission_plans(
    mission_id,version,is_current,status,proposed_title,summary,functional_objective,
    included_scope,excluded_scope,constraints,repository_areas,technical_dependencies,
    risks,blocking_questions,non_blocking_questions,assumptions,recommendations,
    acceptance_criteria,execution_steps,verification_plan,markdown_content,created_by,
    previous_plan_id,change_justification,difference_summary,revalidation_reason
  ) select
    mission_id,next_version,true,'plan_ready',proposed_title,summary,functional_objective,
    included_scope,excluded_scope,constraints,repository_areas,technical_dependencies,
    risks,blocking_questions,non_blocking_questions,assumptions,recommendations,
    acceptance_criteria,execution_steps,verification_plan,markdown_content,(select auth.uid()),
    current_plan.id,trim(p_change_justification),trim(p_difference_summary),trim(p_revalidation_reason)
  from public.forge_mission_plans where id=current_plan.id
  returning id into new_plan_id;
  incident_id := public.forge_record_mission_incident(
    p_mission_id,p_checkpoint_key,'human_decision_required','PLAN_DEVIATION',
    trim(p_summary),jsonb_build_object('change_type',p_change_type,'affected_objects',p_affected_objects),
    p_action_key,3,'Valider la nouvelle version ou refuser le changement'
  );
  update public.forge_mission_incidents
  set expected_plan_id=current_plan.id,current_plan_id=new_plan_id where id=incident_id;
  update public.forge_missions
  set execution_plan_id=null,planning_validated_at=null,status='blocked' where id=p_mission_id;
  return action_id;
end;
$$;

create or replace function public.forge_reject_current_plan(p_mission_id uuid,p_plan_id uuid,p_reason text)
returns void language plpgsql security invoker set search_path='' as $$
declare previous_id uuid;
begin
  select previous_plan_id into previous_id from public.forge_mission_plans
  where id=p_plan_id and mission_id=p_mission_id and is_current=true and status<>'validated' for update;
  if previous_id is null or length(trim(coalesce(p_reason,'')))=0 then
    raise exception 'Le refus exige une version courante remplaçante et une justification';
  end if;
  update public.forge_mission_plans set is_current=false,status='rejected',
    rejected_at=now(),rejected_by=(select auth.uid()) where id=p_plan_id;
  update public.forge_mission_plans set is_current=true where id=previous_id and status='validated';
  if not found then raise exception 'Le plan precedent valide est introuvable'; end if;
  update public.forge_missions set execution_plan_id=previous_id,status='plan_validated',
    planning_validated_at=now() where id=p_mission_id;
  update public.forge_mission_incidents set resolution_status='resolved',resolved_at=now(),
    correction_strategy='manual_resolution',updated_at=now()
  where mission_id=p_mission_id and current_plan_id=p_plan_id
    and resolution_status in ('blocked','detected');
  insert into public.forge_activity_logs(mission_id,event_type,message,metadata)
  values(p_mission_id,'plan_reopened','Nouvelle version refusee; retour explicite au plan valide precedent',
    jsonb_build_object('rejected_plan_id',p_plan_id,'restored_plan_id',previous_id,'reason',trim(p_reason)));
end $$;

drop function if exists public.forge_validate_mission_plan(uuid);
revoke all on function public.forge_validate_mission_plan(uuid,uuid) from public,anon;
grant execute on function public.forge_validate_mission_plan(uuid,uuid) to authenticated;
revoke all on function public.forge_record_plan_action(uuid,text,text,text,text,text,jsonb,text,text,text) from public,anon;
grant execute on function public.forge_record_plan_action(uuid,text,text,text,text,text,jsonb,text,text,text) to authenticated;
revoke all on function public.forge_reject_current_plan(uuid,uuid,text) from public,anon;
grant execute on function public.forge_reject_current_plan(uuid,uuid,text) to authenticated;
revoke all on function public.prepare_forge_plan_version_metadata() from public,anon,authenticated;
