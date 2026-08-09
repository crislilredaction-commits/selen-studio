-- Selen Daily Lot 1B.2 - a reopened checklist task must become unread again.

create or replace function public.daily_sync_checklist_notification(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.daily_organisation_checklist_items%rowtype;
  organisation_name_value text;
  assignment_agent_id uuid;
  assignment_user_id uuid;
  source_key_value text;
  is_attention boolean;
begin
  select * into item
  from public.daily_organisation_checklist_items
  where id = p_item_id;

  if not found then
    delete from public.notifications
    where source_key = 'daily_checklist:' || p_item_id::text;
    return;
  end if;

  source_key_value := 'daily_checklist:' || item.id::text;
  is_attention := item.status in ('todo','to_review','blocked');

  select o.name into organisation_name_value
  from public.organisations o
  where o.id = item.organisation_id;

  select a.agent_profile_id, ap.user_id
    into assignment_agent_id, assignment_user_id
  from public.daily_organisation_assignments a
  join public.agent_profiles ap on ap.id = a.agent_profile_id and ap.is_active = true
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
    'daily_checklist',
    case item.status
      when 'blocked' then 'Point Daily bloqué'
      when 'to_review' then 'Vérification Daily à effectuer'
      else 'Action Daily à effectuer'
    end,
    item.label,
    organisation_name_value,
    '/agent/daily/organisations/' || item.organisation_id::text || '?tab=checklist',
    case when assignment_agent_id is null then 'admin' else 'agent' end,
    assignment_user_id,
    assignment_agent_id,
    false,
    null,
    null,
    item.signaled_at + interval '72 hours',
    item.signaled_at,
    source_key_value,
    'daily_checklist'
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
$$;

revoke execute on function public.daily_sync_checklist_notification(uuid)
  from public, anon, authenticated;
grant execute on function public.daily_sync_checklist_notification(uuid)
  to service_role;
