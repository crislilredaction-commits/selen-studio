-- Selen Daily — session setup chosen by the OF is not a Studio validation task.
-- Dates/schedule/location become validated automatically when the session is complete.
-- Trainer assignment becomes validated automatically as soon as an active trainer has
-- been selected by the OF. Client-only checklist rows must never generate agent/admin
-- notifications. No Auth, RLS, role, secret or infrastructure change.

create or replace function public.daily_sync_session_setup_checklist()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  schedule_blocks_json jsonb := coalesce(to_jsonb(new.schedule_blocks), '[]'::jsonb);
  trainer_ids_json jsonb := coalesce(to_jsonb(new.trainer_ids), '[]'::jsonb);
  schedule_ready boolean;
  trainer_ready boolean;
begin
  schedule_ready := new.start_date is not null
    and new.end_date is not null
    and jsonb_typeof(schedule_blocks_json) = 'array'
    and jsonb_array_length(schedule_blocks_json) > 0
    and case
      when new.modality = 'presentiel' then nullif(btrim(coalesce(new.location_address, '')), '') is not null
      when new.modality = 'distanciel' then nullif(btrim(coalesce(new.remote_url, '')), '') is not null
      when new.modality = 'mixte' then nullif(btrim(coalesce(new.location_address, '')), '') is not null
        and nullif(btrim(coalesce(new.remote_url, '')), '') is not null
      else false
    end;

  trainer_ready := jsonb_typeof(trainer_ids_json) = 'array'
    and jsonb_array_length(trainer_ids_json) > 0;

  update public.daily_session_checklist_items
  set responsibility = 'client',
      label = 'Dates, horaires et lieu définis par l’OF',
      description = 'Ces éléments sont validés automatiquement lors de l’enregistrement de la session.',
      status = case when schedule_ready then 'validated' else 'todo' end
  where session_id = new.id
    and item_key = 'schedule_location'
    and (
      responsibility is distinct from 'client'
      or label is distinct from 'Dates, horaires et lieu définis par l’OF'
      or description is distinct from 'Ces éléments sont validés automatiquement lors de l’enregistrement de la session.'
      or status is distinct from case when schedule_ready then 'validated' else 'todo' end
    );

  update public.daily_session_checklist_items
  set responsibility = 'client',
      label = 'Formateur défini par l’OF',
      description = 'L’affectation du formateur est validée automatiquement dès son enregistrement par l’OF.',
      status = case when trainer_ready then 'validated' else 'todo' end
  where session_id = new.id
    and item_key = 'trainer_assignment'
    and (
      responsibility is distinct from 'client'
      or label is distinct from 'Formateur défini par l’OF'
      or description is distinct from 'L’affectation du formateur est validée automatiquement dès son enregistrement par l’OF.'
      or status is distinct from case when trainer_ready then 'validated' else 'todo' end
    );

  return new;
end;
$function$;

drop trigger if exists daily_sessions_sync_setup_checklist on public.daily_sessions;
create trigger daily_sessions_sync_setup_checklist
after insert or update of start_date, end_date, schedule_blocks, location_address, remote_url, modality, trainer_ids
on public.daily_sessions
for each row
execute function public.daily_sync_session_setup_checklist();

create or replace function public.daily_sync_session_checklist_notification(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  item public.daily_session_checklist_items%rowtype;
  org_name text;
  formation_title text;
  source_key_value text;
  is_attention boolean;
  assignment_agent_id uuid;
  assignment_user_id uuid;
  link_path_value text;
begin
  select * into item from public.daily_session_checklist_items where id = p_item_id;
  if not found then
    delete from public.notifications where source_key = 'daily_session_checklist:' || p_item_id::text;
    return;
  end if;

  source_key_value := 'daily_session_checklist:' || item.id::text;
  is_attention := item.status in ('todo', 'to_review', 'blocked')
    and item.responsibility in ('shared', 'selen')
    and item.signaled_at is not null
    and public.daily_session_checklist_phase_available(item.session_id, item.phase);

  if not is_attention then
    update public.notifications
    set dismissed_at = coalesce(dismissed_at, now()),
        read_at = coalesce(read_at, now())
    where source_key = source_key_value;
    return;
  end if;

  select o.name into org_name from public.organisations o where o.id = item.organisation_id;
  select f.title into formation_title
  from public.daily_sessions s
  join public.daily_formations f on f.id = s.formation_id
  where s.id = item.session_id;

  select a.agent_profile_id, ap.user_id into assignment_agent_id, assignment_user_id
  from public.daily_organisation_assignments a
  join public.agent_profiles ap on ap.id = a.agent_profile_id and ap.is_active = true
  where a.organisation_id = item.organisation_id;

  link_path_value := case item.item_key
    when 'pretraining_documents' then '/agent/daily/pretraining-documents'
    when 'trainer_assignment' then '/agent/daily/sessions/' || item.session_id::text
    when 'training_ready' then '/agent/daily/session-dossiers/' || item.session_id::text
    when 'attendance_followup' then '/agent/daily/sessions/' || item.session_id::text
    when 'posttraining_documents' then '/agent/daily/posttraining-documents'
    when 'quality_analysis_review' then '/agent/daily/session-dossiers/' || item.session_id::text || '/followup'
    when 'selen_closure_review' then '/agent/daily/session-dossiers/' || item.session_id::text || '/closure'
    else '/agent/daily/session-dossiers/' || item.session_id::text || '/full'
  end;

  insert into public.notifications(
    type,title,content,organisation_name,link_path,target_role,target_user_id,
    target_agent_profile_id,pinned,read_at,dismissed_at,escalation_at,created_at,
    source_key,source_kind
  )
  values(
    'daily_session_checklist',
    item.label,
    coalesce(formation_title,'Session Daily') || case when item.description is not null and btrim(item.description) <> '' then ' · ' || item.description else '' end,
    org_name,
    link_path_value,
    case when assignment_agent_id is null then 'admin' else 'agent' end,
    assignment_user_id,
    assignment_agent_id,
    false,null,null,
    item.signaled_at + interval '24 hours',
    item.signaled_at,
    source_key_value,
    'daily_session_checklist'
  )
  on conflict(source_key) where source_key is not null do update
  set title = excluded.title,
      content = excluded.content,
      organisation_name = excluded.organisation_name,
      link_path = excluded.link_path,
      target_role = excluded.target_role,
      target_user_id = excluded.target_user_id,
      target_agent_profile_id = excluded.target_agent_profile_id,
      escalation_at = excluded.escalation_at,
      created_at = excluded.created_at,
      dismissed_at = null,
      read_at = case
        when public.notifications.dismissed_at is not null
          or public.notifications.target_agent_profile_id is distinct from excluded.target_agent_profile_id
          or public.notifications.title is distinct from excluded.title
          or public.notifications.content is distinct from excluded.content
          or public.notifications.link_path is distinct from excluded.link_path
        then null
        else public.notifications.read_at
      end;
end;
$function$;

-- Align existing session setup rows with the same rule.
update public.daily_session_checklist_items item
set responsibility = 'client',
    label = case item.item_key
      when 'schedule_location' then 'Dates, horaires et lieu définis par l’OF'
      else 'Formateur défini par l’OF'
    end,
    description = case item.item_key
      when 'schedule_location' then 'Ces éléments sont validés automatiquement lors de l’enregistrement de la session.'
      else 'L’affectation du formateur est validée automatiquement dès son enregistrement par l’OF.'
    end,
    status = case
      when item.item_key = 'schedule_location' then case when
        s.start_date is not null
        and s.end_date is not null
        and jsonb_typeof(coalesce(to_jsonb(s.schedule_blocks), '[]'::jsonb)) = 'array'
        and jsonb_array_length(coalesce(to_jsonb(s.schedule_blocks), '[]'::jsonb)) > 0
        and case
          when s.modality = 'presentiel' then nullif(btrim(coalesce(s.location_address, '')), '') is not null
          when s.modality = 'distanciel' then nullif(btrim(coalesce(s.remote_url, '')), '') is not null
          when s.modality = 'mixte' then nullif(btrim(coalesce(s.location_address, '')), '') is not null
            and nullif(btrim(coalesce(s.remote_url, '')), '') is not null
          else false
        end
      then 'validated' else 'todo' end
      else case when
        jsonb_typeof(coalesce(to_jsonb(s.trainer_ids), '[]'::jsonb)) = 'array'
        and jsonb_array_length(coalesce(to_jsonb(s.trainer_ids), '[]'::jsonb)) > 0
      then 'validated' else 'todo' end
    end
from public.daily_sessions s
where s.id = item.session_id
  and item.item_key in ('schedule_location', 'trainer_assignment');

-- Reconcile existing notifications after responsibility/status changes.
do $block$
declare
  row_item record;
begin
  for row_item in
    select id
    from public.daily_session_checklist_items
    where item_key in ('schedule_location', 'trainer_assignment')
  loop
    perform public.daily_sync_session_checklist_notification(row_item.id);
  end loop;
end;
$block$;
