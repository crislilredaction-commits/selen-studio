-- Selen Daily — make session checklist notifications phase-aware.
-- Future-phase tasks must stay silent until their session phase becomes actionable.
-- The 24-hour escalation clock starts when the task is actually signaled, not when
-- the checklist row was seeded. No Auth, RLS, assignment or business-state change.

create or replace function public.daily_session_checklist_phase_available(
  p_session_id uuid,
  p_phase text,
  p_now timestamptz default now()
)
returns boolean
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  session_start date;
  session_end date;
  paris_today date;
begin
  select s.start_date, coalesce(s.end_date, s.start_date)
    into session_start, session_end
  from public.daily_sessions s
  where s.id = p_session_id;

  if not found then return false; end if;
  paris_today := (p_now at time zone 'Europe/Paris')::date;

  if p_phase = 'before' then return true; end if;
  if p_phase = 'during' then return session_start is not null and paris_today >= session_start; end if;
  if p_phase = 'after' then return session_end is not null and paris_today > session_end; end if;
  return false;
end;
$function$;

create or replace function public.daily_maintain_session_checklist_timestamps()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.updated_at := now();

  if tg_op = 'INSERT' then
    if new.signaled_at is null
       and public.daily_session_checklist_phase_available(new.session_id, new.phase) then
      new.signaled_at := now();
    end if;
    if new.status = 'in_progress' and new.started_at is null then new.started_at := now(); end if;
    if new.status in ('validated','not_applicable') and new.completed_at is null then new.completed_at := now(); end if;
    return new;
  end if;

  if new.signaled_at is null
     and new.status in ('todo','in_progress','to_review','blocked')
     and public.daily_session_checklist_phase_available(new.session_id, new.phase) then
    new.signaled_at := now();
  end if;

  if new.status is distinct from old.status then
    if new.status = 'in_progress' and new.started_at is null then new.started_at := now(); end if;
    if new.status in ('validated','not_applicable') then
      new.completed_at := now();
    elsif old.status in ('validated','not_applicable') then
      new.completed_at := null;
      if public.daily_session_checklist_phase_available(new.session_id, new.phase) then
        new.signaled_at := now();
      else
        new.signaled_at := null;
      end if;
    end if;
  end if;
  return new;
end;
$function$;

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

create or replace function public.daily_refresh_session_checklist_notifications()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  checklist_id uuid;
  refreshed integer := 0;
begin
  update public.daily_session_checklist_items item
  set signaled_at = now()
  where item.signaled_at is null
    and item.status in ('todo','in_progress','to_review','blocked')
    and public.daily_session_checklist_phase_available(item.session_id, item.phase);

  for checklist_id in
    select id
    from public.daily_session_checklist_items
    where status in ('todo','in_progress','to_review','blocked')
  loop
    perform public.daily_sync_session_checklist_notification(checklist_id);
    refreshed := refreshed + 1;
  end loop;
  return refreshed;
end;
$function$;

revoke all on function public.daily_refresh_session_checklist_notifications() from public, anon, authenticated;
grant execute on function public.daily_refresh_session_checklist_notifications() to service_role;

-- Repair existing future-phase rows created before this phase-aware rule.
update public.daily_session_checklist_items item
set signaled_at = null
where item.status in ('todo','in_progress','to_review','blocked')
  and not public.daily_session_checklist_phase_available(item.session_id, item.phase);

select public.daily_refresh_session_checklist_notifications();
