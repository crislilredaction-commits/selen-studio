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
begin
  select * into item
  from public.daily_session_checklist_items
  where id = p_item_id;

  if not found then
    delete from public.notifications
    where source_key = 'daily_session_checklist:' || p_item_id::text;
    return;
  end if;

  source_key_value := 'daily_session_checklist:' || item.id::text;
  is_attention := item.status in ('todo', 'to_review', 'blocked');

  select o.name into org_name
  from public.organisations o
  where o.id = item.organisation_id;

  select f.title into formation_title
  from public.daily_sessions s
  join public.daily_formations f on f.id = s.formation_id
  where s.id = item.session_id;

  select a.agent_profile_id, ap.user_id
    into assignment_agent_id, assignment_user_id
  from public.daily_organisation_assignments a
  join public.agent_profiles ap
    on ap.id = a.agent_profile_id
   and ap.is_active = true
  where a.organisation_id = item.organisation_id;

  if not is_attention then
    update public.notifications
    set dismissed_at = coalesce(dismissed_at, now()),
        read_at = coalesce(read_at, now())
    where source_key = source_key_value;
    return;
  end if;

  insert into public.notifications(
    type,
    title,
    content,
    organisation_name,
    link_path,
    target_role,
    target_user_id,
    target_agent_profile_id,
    pinned,
    read_at,
    dismissed_at,
    escalation_at,
    created_at,
    source_key,
    source_kind
  ) values (
    'daily_session_checklist',
    case item.status
      when 'blocked' then 'Dossier de session bloqué'
      when 'to_review' then 'Dossier de session à vérifier'
      else 'Action dossier de session'
    end,
    coalesce(formation_title, 'Session Daily') || ' · ' || item.label,
    org_name,
    '/agent/daily/session-dossiers/' || item.session_id::text,
    case when assignment_agent_id is null then 'admin' else 'agent' end,
    assignment_user_id,
    assignment_agent_id,
    false,
    null,
    null,
    item.signaled_at + interval '72 hours',
    item.signaled_at,
    source_key_value,
    'daily_session_checklist'
  )
  on conflict (source_key) where source_key is not null do update
  set title = excluded.title,
      content = excluded.content,
      organisation_name = excluded.organisation_name,
      link_path = excluded.link_path,
      target_role = excluded.target_role,
      target_user_id = excluded.target_user_id,
      target_agent_profile_id = excluded.target_agent_profile_id,
      escalation_at = excluded.escalation_at,
      dismissed_at = null,
      read_at = case
        when public.notifications.dismissed_at is not null
          or public.notifications.target_agent_profile_id is distinct from excluded.target_agent_profile_id
          or public.notifications.title is distinct from excluded.title
          or public.notifications.content is distinct from excluded.content
        then null
        else public.notifications.read_at
      end;
end;
$function$;

create or replace function public.daily_resync_assignment_notifications()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  organisation_id_value uuid;
  checklist_id uuid;
begin
  organisation_id_value := coalesce(new.organisation_id, old.organisation_id);

  for checklist_id in
    select id
    from public.daily_organisation_checklist_items
    where organisation_id = organisation_id_value
  loop
    perform public.daily_sync_checklist_notification(checklist_id);
  end loop;

  for checklist_id in
    select id
    from public.daily_session_checklist_items
    where organisation_id = organisation_id_value
  loop
    perform public.daily_sync_session_checklist_notification(checklist_id);
  end loop;

  return coalesce(new, old);
end;
$function$;
