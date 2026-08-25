create or replace function public.daily_sync_checklist_notification(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  -- A seeded checklist item in todo is not yet an agent action.
  is_attention := item.status in ('to_review','blocked');

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
      else 'Vérification Daily à effectuer'
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
$function$;

update public.notifications n
set dismissed_at = coalesce(n.dismissed_at, now()),
    read_at = coalesce(n.read_at, now())
from public.daily_organisation_checklist_items i
where n.source_key = 'daily_checklist:' || i.id::text
  and i.status = 'todo'
  and n.dismissed_at is null;

create or replace function public.daily_notify_subscription_purchase()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  client_email_value text;
  organisation_id_value uuid;
  organisation_name_value text;
  source_key_value text;
begin
  if new.status <> 'active' then
    return new;
  end if;

  select lower(u.email)
    into client_email_value
  from auth.users u
  where u.id = new.user_id;

  if client_email_value is null then
    return new;
  end if;

  select o.id, o.name
    into organisation_id_value, organisation_name_value
  from public.organisations o
  where lower(o.email) = client_email_value
  order by o.created_at desc
  limit 1;

  source_key_value := 'daily_purchase:' || new.id::text;

  insert into public.notifications(
    type,
    title,
    content,
    organisation_name,
    link_path,
    target_role,
    pinned,
    created_at,
    source_key,
    source_kind
  ) values (
    'daily_purchase',
    'Nouvel achat Selen Daily',
    client_email_value,
    organisation_name_value,
    case
      when organisation_id_value is not null
        then '/agent/daily/organisations/' || organisation_id_value::text
      else '/agent/daily'
    end,
    'admin',
    false,
    coalesce(new.created_at, now()),
    source_key_value,
    'daily_purchase'
  )
  on conflict (source_key) where source_key is not null do nothing;

  return new;
end;
$function$;

revoke all on function public.daily_notify_subscription_purchase() from public, anon, authenticated;
grant execute on function public.daily_notify_subscription_purchase() to service_role;

drop trigger if exists daily_notify_subscription_purchase_trigger on public.daily_subscriptions;
create trigger daily_notify_subscription_purchase_trigger
after insert or update of status on public.daily_subscriptions
for each row
when (new.status = 'active')
execute function public.daily_notify_subscription_purchase();

insert into public.notifications(
  type, title, content, organisation_name, link_path, target_role,
  pinned, created_at, source_key, source_kind
)
select
  'daily_purchase',
  'Nouvel achat Selen Daily',
  lower(u.email),
  o.name,
  case when o.id is not null then '/agent/daily/organisations/' || o.id::text else '/agent/daily' end,
  'admin',
  false,
  s.created_at,
  'daily_purchase:' || s.id::text,
  'daily_purchase'
from public.daily_subscriptions s
join auth.users u on u.id = s.user_id
left join lateral (
  select oo.id, oo.name
  from public.organisations oo
  where lower(oo.email) = lower(u.email)
  order by oo.created_at desc
  limit 1
) o on true
where s.status = 'active'
on conflict (source_key) where source_key is not null do nothing;
