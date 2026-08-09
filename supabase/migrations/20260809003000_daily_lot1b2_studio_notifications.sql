-- Selen Daily Lot 1B.2 - connect checklist and trainer expiry alerts to Studio notifications.

alter table public.notifications
  add column if not exists source_key text,
  add column if not exists source_kind text;

create unique index if not exists notifications_source_key_unique_idx
  on public.notifications(source_key)
  where source_key is not null;

create index if not exists notifications_escalation_idx
  on public.notifications(escalation_at)
  where dismissed_at is null and escalation_at is not null;

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
      escalation_at = excluded.escalation_at,
      dismissed_at = null,
      read_at = case
        when public.notifications.target_user_id is distinct from excluded.target_user_id
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

create or replace function public.daily_sync_checklist_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.notifications
    where source_key = 'daily_checklist:' || old.id::text;
    return old;
  end if;

  perform public.daily_sync_checklist_notification(new.id);
  return new;
end;
$$;

revoke execute on function public.daily_sync_checklist_notification_trigger()
  from public, anon, authenticated;
grant execute on function public.daily_sync_checklist_notification_trigger()
  to service_role;

drop trigger if exists daily_checklist_notification_sync
  on public.daily_organisation_checklist_items;
create trigger daily_checklist_notification_sync
after insert or update or delete on public.daily_organisation_checklist_items
for each row execute function public.daily_sync_checklist_notification_trigger();

create or replace function public.daily_resync_assignment_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  checklist_id uuid;
begin
  for checklist_id in
    select id
    from public.daily_organisation_checklist_items
    where organisation_id = coalesce(new.organisation_id, old.organisation_id)
  loop
    perform public.daily_sync_checklist_notification(checklist_id);
  end loop;
  return coalesce(new, old);
end;
$$;

revoke execute on function public.daily_resync_assignment_notifications()
  from public, anon, authenticated;
grant execute on function public.daily_resync_assignment_notifications()
  to service_role;

drop trigger if exists daily_assignment_notification_resync
  on public.daily_organisation_assignments;
create trigger daily_assignment_notification_resync
after insert or update or delete on public.daily_organisation_assignments
for each row execute function public.daily_resync_assignment_notifications();

create or replace function public.daily_sync_trainer_certification_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cert record;
  assignment_user_id uuid;
  organisation_name_value text;
  source_key_value text;
  touched integer := 0;
begin
  -- Dismiss obsolete expiry reminders first. They can be re-opened below if still relevant.
  update public.notifications
  set dismissed_at = coalesce(dismissed_at, now())
  where source_kind = 'daily_trainer_certification'
    and source_key is not null;

  for cert in
    select
      c.id,
      c.title,
      c.valid_until,
      t.organisation_id,
      t.display_name
    from public.daily_trainer_certifications c
    join public.daily_trainer_profiles t on t.id = c.trainer_profile_id
    where c.validity_mode = 'limited'
      and c.valid_until is not null
      and c.valid_until <= current_date + 90
      and t.active = true
  loop
    source_key_value := 'daily_trainer_certification:' || cert.id::text;

    select o.name into organisation_name_value
    from public.organisations o
    where o.id = cert.organisation_id;

    select ap.user_id into assignment_user_id
    from public.daily_organisation_assignments a
    join public.agent_profiles ap on ap.id = a.agent_profile_id and ap.is_active = true
    where a.organisation_id = cert.organisation_id;

    insert into public.notifications(
      type,
      title,
      content,
      organisation_name,
      link_path,
      target_role,
      target_user_id,
      pinned,
      read_at,
      dismissed_at,
      escalation_at,
      source_key,
      source_kind
    ) values (
      'daily_trainer_certification',
      case
        when cert.valid_until < current_date then 'Certification formateur expirée'
        when cert.valid_until <= current_date + 30 then 'Certification à renouveler bientôt'
        else 'Échéance certification formateur'
      end,
      coalesce(cert.display_name, 'Formateur') || ' · ' || cert.title || ' · échéance ' || to_char(cert.valid_until, 'DD/MM/YYYY'),
      organisation_name_value,
      '/agent/daily/organisations/' || cert.organisation_id::text || '?tab=trainers',
      case when assignment_user_id is null then 'admin' else 'agent' end,
      assignment_user_id,
      false,
      null,
      null,
      null,
      source_key_value,
      'daily_trainer_certification'
    )
    on conflict (source_key) where source_key is not null do update
    set title = excluded.title,
        content = excluded.content,
        organisation_name = excluded.organisation_name,
        link_path = excluded.link_path,
        target_role = excluded.target_role,
        target_user_id = excluded.target_user_id,
        dismissed_at = null,
        read_at = case
          when public.notifications.target_user_id is distinct from excluded.target_user_id
            or public.notifications.title is distinct from excluded.title
            or public.notifications.content is distinct from excluded.content
          then null
          else public.notifications.read_at
        end;

    touched := touched + 1;
  end loop;

  return touched;
end;
$$;

revoke execute on function public.daily_sync_trainer_certification_notifications()
  from public, anon, authenticated;
grant execute on function public.daily_sync_trainer_certification_notifications()
  to service_role;

-- Initial sync for checklist items already seeded by the previous Lot 1B.2 migration.
do $$
declare
  checklist_id uuid;
begin
  for checklist_id in select id from public.daily_organisation_checklist_items loop
    perform public.daily_sync_checklist_notification(checklist_id);
  end loop;
  perform public.daily_sync_trainer_certification_notifications();
end;
$$;
