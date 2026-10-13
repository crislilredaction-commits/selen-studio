-- Formation candidatures are analyzed by Selen, then accepted by the OF.
-- The legacy session-form review is not a second approval requirement.
-- Keep the final OF decision, active parents, phase and responsibility guards.
begin;

CREATE OR REPLACE FUNCTION public.daily_sync_session_checklist_notification(p_item_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  item public.daily_session_checklist_items%rowtype;
  session_row public.daily_sessions%rowtype;
  formation_row public.daily_formations%rowtype;
  org_name text;
  source_key_value text;
  assignment_agent_id uuid;
  assignment_user_id uuid;
  link_path_value text;
  parent_active boolean := false;
  candidature_accepted boolean := false;
  is_attention boolean := false;
begin
  select * into item from public.daily_session_checklist_items where id = p_item_id;
  if not found then
    update public.notifications
    set dismissed_at = coalesce(dismissed_at, now()), read_at = coalesce(read_at, now())
    where source_key = 'daily_session_checklist:' || p_item_id::text;
    return;
  end if;

  source_key_value := 'daily_session_checklist:' || item.id::text;
  select * into session_row from public.daily_sessions where id = item.session_id;
  if found then
    select * into formation_row from public.daily_formations where id = session_row.formation_id;
    parent_active := found
      and session_row.organisation_id = item.organisation_id
      and formation_row.organisation_id = item.organisation_id
      and coalesce(lower(session_row.status), '') not in ('archived','cancelled','canceled','deleted','removed','obsolete','abandoned','completed','done','closed')
      and coalesce(lower(formation_row.status), '') not in ('archived','cancelled','canceled','deleted','removed','obsolete','abandoned','completed','done','closed')
      and public.daily_a11_organisation_is_active(item.organisation_id);
  end if;

  if parent_active and item.item_key = 'pretraining_documents' then
    select exists (
      select 1 from public.daily_formation_registration_requests r
      where r.attached_session_id = item.session_id
        and r.formation_id = session_row.formation_id
        and r.decision_status = 'accepted'
    ) into candidature_accepted;
  else
    candidature_accepted := true;
  end if;

  is_attention := parent_active
    and item.status in ('todo','in_progress','to_review','blocked')
    and item.responsibility in ('selen','shared')
    and item.signaled_at is not null
    and public.daily_session_checklist_phase_available(item.session_id, item.phase)
    and candidature_accepted;

  if not is_attention then
    update public.notifications
    set dismissed_at = coalesce(dismissed_at, now()), read_at = coalesce(read_at, now())
    where source_key = source_key_value;
    return;
  end if;

  select o.name into org_name from public.organisations o where o.id = item.organisation_id;
  select a.agent_profile_id, ap.user_id into assignment_agent_id, assignment_user_id
  from public.daily_organisation_assignments a
  join public.agent_profiles ap on ap.id = a.agent_profile_id and ap.is_active = true
  where a.organisation_id = item.organisation_id;

  link_path_value := case item.item_key
    when 'pretraining_documents' then '/agent/daily/pretraining-documents?session=' || item.session_id::text
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
  ) values (
    'daily_session_checklist', item.label,
    coalesce(formation_row.title,'Session Daily') || case when nullif(btrim(item.description), '') is not null then ' · ' || item.description else '' end,
    org_name, link_path_value,
    case when assignment_agent_id is null then 'admin' else 'agent' end,
    assignment_user_id, assignment_agent_id, false, null, null,
    item.signaled_at + interval '24 hours', item.signaled_at,
    source_key_value, 'daily_session_checklist'
  )
  on conflict (source_key) where source_key is not null do update
  set title = excluded.title, content = excluded.content,
      organisation_name = excluded.organisation_name, link_path = excluded.link_path,
      target_role = excluded.target_role, target_user_id = excluded.target_user_id,
      target_agent_profile_id = excluded.target_agent_profile_id,
      escalation_at = excluded.escalation_at, created_at = excluded.created_at,
      dismissed_at = null,
      read_at = case
        when public.notifications.dismissed_at is not null
          or public.notifications.target_agent_profile_id is distinct from excluded.target_agent_profile_id
          or public.notifications.title is distinct from excluded.title
          or public.notifications.content is distinct from excluded.content
          or public.notifications.link_path is distinct from excluded.link_path
        then null else public.notifications.read_at end;
end;
$function$;

-- Refresh only the affected document-preparation notifications. No inscription,
-- signature or email is created, and existing notification source keys are reused.
do $$
declare item_id uuid;
begin
  for item_id in
    select id from public.daily_session_checklist_items
    where item_key = 'pretraining_documents'
  loop
    perform public.daily_sync_session_checklist_notification(item_id);
  end loop;
end;
$$;

commit;

