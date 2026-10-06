-- A11 — keep active Daily notifications aligned with the canonical task lifecycle.
-- Additive trigger wiring only. Historical notifications are dismissed, never deleted.

create or replace function public.daily_a11_organisation_is_active(p_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organisations o
    join auth.users u on lower(u.email) = lower(o.email)
    join public.daily_subscriptions subscription on subscription.user_id = u.id
    where o.id = p_organisation_id
      and coalesce(lower(o.status), '') not in ('archived','cancelled','canceled','deleted','removed','obsolete','abandoned','completed','done','closed')
      and subscription.status = 'active'
  );
$$;

revoke all on function public.daily_a11_organisation_is_active(uuid) from public, anon, authenticated;
grant execute on function public.daily_a11_organisation_is_active(uuid) to service_role;

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
  select * into item from public.daily_organisation_checklist_items where id = p_item_id;
  if not found then
    update public.notifications
    set dismissed_at = coalesce(dismissed_at, now()), read_at = coalesce(read_at, now())
    where source_key = 'daily_checklist:' || p_item_id::text;
    return;
  end if;

  source_key_value := 'daily_checklist:' || item.id::text;
  is_attention := item.status in ('to_review','blocked')
    and public.daily_a11_organisation_is_active(item.organisation_id);

  if not is_attention then
    update public.notifications
    set dismissed_at = coalesce(dismissed_at, now()), read_at = coalesce(read_at, now())
    where source_key = source_key_value;
    return;
  end if;

  select o.name into organisation_name_value from public.organisations o where o.id = item.organisation_id;
  select a.agent_profile_id, ap.user_id into assignment_agent_id, assignment_user_id
  from public.daily_organisation_assignments a
  join public.agent_profiles ap on ap.id = a.agent_profile_id and ap.is_active = true
  where a.organisation_id = item.organisation_id;

  insert into public.notifications(
    type,title,content,organisation_name,link_path,target_role,target_user_id,
    target_agent_profile_id,pinned,read_at,dismissed_at,escalation_at,created_at,
    source_key,source_kind
  ) values (
    'daily_checklist',
    case item.status when 'blocked' then 'Point Daily bloqué' else 'Vérification Daily à effectuer' end,
    item.label, organisation_name_value,
    '/agent/daily/organisations/' || item.organisation_id::text || '?tab=checklist',
    case when assignment_agent_id is null then 'admin' else 'agent' end,
    assignment_user_id, assignment_agent_id, false, null, null,
    item.signaled_at + interval '24 hours', item.signaled_at,
    source_key_value, 'daily_checklist'
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
        then null else public.notifications.read_at end;
end;
$$;

create or replace function public.daily_sync_session_checklist_notification(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
  registration_current boolean := false;
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

    select exists (
      select 1
      from public.daily_registration_reviews review
      cross join lateral (
        select max(response.created_at) as created_at
        from public.daily_registration_responses response
        where response.session_id = item.session_id
      ) latest_response
      where review.session_id = item.session_id
        and latest_response.created_at is not null
        and review.validated_at >= latest_response.created_at
    ) into registration_current;
  else
    candidature_accepted := true;
    registration_current := true;
  end if;

  is_attention := parent_active
    and item.status in ('todo','in_progress','to_review','blocked')
    and item.responsibility in ('selen','shared')
    and item.signaled_at is not null
    and public.daily_session_checklist_phase_available(item.session_id, item.phase)
    and candidature_accepted
    and registration_current;

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
$$;

create or replace function public.daily_a11_resync_session_notifications(p_session_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare checklist_id uuid;
begin
  if p_session_id is null then return; end if;
  for checklist_id in select id from public.daily_session_checklist_items where session_id = p_session_id loop
    perform public.daily_sync_session_checklist_notification(checklist_id);
  end loop;
end;
$$;

revoke all on function public.daily_a11_resync_session_notifications(uuid) from public, anon, authenticated;
grant execute on function public.daily_a11_resync_session_notifications(uuid) to service_role;

create or replace function public.daily_a11_resync_session_notifications()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.daily_a11_resync_session_notifications(coalesce(new.id, old.id));
  return coalesce(new, old);
end;
$$;

create or replace function public.daily_a11_resync_formation_notifications()
returns trigger language plpgsql security definer set search_path = public as $$
declare session_id uuid;
begin
  for session_id in select id from public.daily_sessions where formation_id = coalesce(new.id, old.id) loop
    perform public.daily_a11_resync_session_notifications(session_id);
  end loop;
  return coalesce(new, old);
end;
$$;

create or replace function public.daily_a11_resync_candidature_notifications()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' then perform public.daily_a11_resync_session_notifications(old.attached_session_id); end if;
  if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.attached_session_id is distinct from old.attached_session_id or new.decision_status is distinct from old.decision_status) then
    perform public.daily_a11_resync_session_notifications(new.attached_session_id);
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.daily_a11_resync_registration_notifications()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' then perform public.daily_a11_resync_session_notifications(old.session_id); end if;
  if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.session_id is distinct from old.session_id or to_jsonb(new) is distinct from to_jsonb(old)) then
    perform public.daily_a11_resync_session_notifications(new.session_id);
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.daily_a11_resync_subscription_notifications()
returns trigger language plpgsql security definer set search_path = public as $$
declare session_id uuid; checklist_id uuid; user_email text;
begin
  for session_id in select id from public.daily_sessions where user_id = coalesce(new.user_id, old.user_id) loop
    perform public.daily_a11_resync_session_notifications(session_id);
  end loop;
  select email into user_email from auth.users where id = coalesce(new.user_id, old.user_id);
  for checklist_id in
    select item.id from public.daily_organisation_checklist_items item
    join public.organisations o on o.id = item.organisation_id
    where lower(o.email) = lower(user_email)
  loop perform public.daily_sync_checklist_notification(checklist_id); end loop;
  return coalesce(new, old);
end;
$$;

create or replace function public.daily_a11_resync_organisation_notifications()
returns trigger language plpgsql security definer set search_path = public as $$
declare session_id uuid; checklist_id uuid;
begin
  for session_id in select id from public.daily_sessions where organisation_id = coalesce(new.id, old.id) loop
    perform public.daily_a11_resync_session_notifications(session_id);
  end loop;
  for checklist_id in select id from public.daily_organisation_checklist_items where organisation_id = coalesce(new.id, old.id) loop
    perform public.daily_sync_checklist_notification(checklist_id);
  end loop;
  return coalesce(new, old);
end;
$$;

revoke all on function public.daily_a11_resync_session_notifications() from public, anon, authenticated;
revoke all on function public.daily_a11_resync_formation_notifications() from public, anon, authenticated;
revoke all on function public.daily_a11_resync_candidature_notifications() from public, anon, authenticated;
revoke all on function public.daily_a11_resync_registration_notifications() from public, anon, authenticated;
revoke all on function public.daily_a11_resync_subscription_notifications() from public, anon, authenticated;
revoke all on function public.daily_a11_resync_organisation_notifications() from public, anon, authenticated;

drop trigger if exists daily_a11_session_notification_lifecycle on public.daily_sessions;
create trigger daily_a11_session_notification_lifecycle after update of status, formation_id, organisation_id, user_id on public.daily_sessions
for each row execute function public.daily_a11_resync_session_notifications();

drop trigger if exists daily_a11_formation_notification_lifecycle on public.daily_formations;
create trigger daily_a11_formation_notification_lifecycle after update of status, organisation_id on public.daily_formations
for each row execute function public.daily_a11_resync_formation_notifications();

drop trigger if exists daily_a11_candidature_notification_lifecycle on public.daily_formation_registration_requests;
create trigger daily_a11_candidature_notification_lifecycle after insert or update of decision_status, attached_session_id or delete on public.daily_formation_registration_requests
for each row execute function public.daily_a11_resync_candidature_notifications();

drop trigger if exists daily_a11_response_notification_lifecycle on public.daily_registration_responses;
create trigger daily_a11_response_notification_lifecycle after insert or update or delete on public.daily_registration_responses
for each row execute function public.daily_a11_resync_registration_notifications();

drop trigger if exists daily_a11_review_notification_lifecycle on public.daily_registration_reviews;
create trigger daily_a11_review_notification_lifecycle after insert or update or delete on public.daily_registration_reviews
for each row execute function public.daily_a11_resync_registration_notifications();

drop trigger if exists daily_a11_subscription_notification_lifecycle on public.daily_subscriptions;
create trigger daily_a11_subscription_notification_lifecycle after update of status on public.daily_subscriptions
for each row execute function public.daily_a11_resync_subscription_notifications();

drop trigger if exists daily_a11_organisation_notification_lifecycle on public.organisations;
create trigger daily_a11_organisation_notification_lifecycle after update of status, email on public.organisations
for each row execute function public.daily_a11_resync_organisation_notifications();

-- Reconcile only existing Daily notification sources. This cannot create unrelated rows.
do $$
declare notification_row record;
begin
  for notification_row in
    select source_kind, source_key from public.notifications
    where dismissed_at is null and source_kind in ('daily_checklist','daily_session_checklist')
  loop
    if notification_row.source_kind = 'daily_checklist' then
      perform public.daily_sync_checklist_notification(replace(notification_row.source_key, 'daily_checklist:', '')::uuid);
    else
      perform public.daily_sync_session_checklist_notification(replace(notification_row.source_key, 'daily_session_checklist:', '')::uuid);
    end if;
  end loop;
end;
$$;
