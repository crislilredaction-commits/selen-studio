-- Selen Daily Lot 2C - session dossier and operational checklist.

create table if not exists public.daily_session_dossiers (
  session_id uuid primary key references public.daily_sessions(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  status text not null default 'active' check (status in ('active','completed','archived')),
  assigned_agent_profile_id uuid references public.agent_profiles(id) on delete set null,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists daily_session_dossiers_org_idx on public.daily_session_dossiers(organisation_id, updated_at desc);
create index if not exists daily_session_dossiers_agent_idx on public.daily_session_dossiers(assigned_agent_profile_id, status);

create table if not exists public.daily_session_checklist_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.daily_sessions(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  item_key text not null,
  phase text not null check (phase in ('before','during','after')),
  responsibility text not null default 'shared' check (responsibility in ('client','selen','shared')),
  label text not null,
  description text,
  status text not null default 'todo' check (status in ('todo','in_progress','to_review','validated','blocked','not_applicable')),
  due_at timestamptz,
  signaled_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  validated_by uuid references auth.users(id) on delete set null,
  note text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id,item_key)
);

create index if not exists daily_session_checklist_session_idx on public.daily_session_checklist_items(session_id, phase, position);
create index if not exists daily_session_checklist_attention_idx on public.daily_session_checklist_items(organisation_id,status,signaled_at);

alter table public.daily_session_dossiers enable row level security;
alter table public.daily_session_checklist_items enable row level security;

create or replace function public.daily_maintain_session_checklist_timestamps()
returns trigger language plpgsql set search_path=public as $$
begin
  new.updated_at := now();
  if tg_op='INSERT' then
    if new.signaled_at is null then new.signaled_at:=now(); end if;
    if new.status='in_progress' and new.started_at is null then new.started_at:=now(); end if;
    if new.status in ('validated','not_applicable') and new.completed_at is null then new.completed_at:=now(); end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    if new.status='in_progress' and new.started_at is null then new.started_at:=now(); end if;
    if new.status in ('validated','not_applicable') then
      new.completed_at:=now();
    elsif old.status in ('validated','not_applicable') then
      new.completed_at:=null;
      new.signaled_at:=now();
    end if;
  end if;
  return new;
end; $$;

revoke execute on function public.daily_maintain_session_checklist_timestamps() from public,anon,authenticated;
grant execute on function public.daily_maintain_session_checklist_timestamps() to service_role;

drop trigger if exists daily_session_checklist_timestamps on public.daily_session_checklist_items;
create trigger daily_session_checklist_timestamps before insert or update on public.daily_session_checklist_items
for each row execute function public.daily_maintain_session_checklist_timestamps();

create or replace function public.daily_seed_session_dossier(p_session_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  s record;
  default_agent uuid;
begin
  select ds.id, ds.organisation_id, ds.start_date, ds.end_date into s
  from public.daily_sessions ds where ds.id=p_session_id;
  if not found then raise exception 'Daily session not found'; end if;

  select doa.agent_profile_id into default_agent
  from public.daily_organisation_assignments doa
  where doa.organisation_id=s.organisation_id;

  insert into public.daily_session_dossiers(session_id,organisation_id,assigned_agent_profile_id,assigned_at)
  values(s.id,s.organisation_id,default_agent,case when default_agent is null then null else now() end)
  on conflict(session_id) do nothing;

  insert into public.daily_session_checklist_items(session_id,organisation_id,item_key,phase,responsibility,label,description,due_at,position) values
    (s.id,s.organisation_id,'training_ready','before','shared','Vérifier la formation de référence','La formation, ses objectifs, modalités et formateurs autorisés doivent être cohérents avant le démarrage.',case when s.start_date is null then null else s.start_date::timestamptz - interval '7 days' end,10),
    (s.id,s.organisation_id,'schedule_location','before','client','Confirmer dates, horaires et lieu','Les dates, horaires, lieu ou lien distanciel doivent être finalisés.',case when s.start_date is null then null else s.start_date::timestamptz - interval '7 days' end,20),
    (s.id,s.organisation_id,'trainer_assignment','before','shared','Confirmer le ou les formateurs','Les formateurs affectés doivent appartenir à l’OF et être autorisés pour la formation.',case when s.start_date is null then null else s.start_date::timestamptz - interval '7 days' end,30),
    (s.id,s.organisation_id,'participants_ready','before','client','Préparer les inscriptions des participants','Les apprenants et leurs informations seront suivis ici dès le Lot 2D.',case when s.start_date is null then null else s.start_date::timestamptz - interval '5 days' end,40),
    (s.id,s.organisation_id,'pretraining_documents','before','shared','Préparer les éléments préformation','Convention, convocation, programme et positionnement seront automatisés dans le Lot 2E.',case when s.start_date is null then null else s.start_date::timestamptz - interval '3 days' end,50),
    (s.id,s.organisation_id,'attendance_followup','during','shared','Suivre la présence et le déroulement','Présences, incidents et adaptations éventuelles doivent être suivis pendant la session.',case when s.end_date is null then null else s.end_date::timestamptz end,60),
    (s.id,s.organisation_id,'end_evaluations','after','client','Réaliser les évaluations de fin','Évaluation des acquis et satisfaction doivent être réalisées et conservées.',case when s.end_date is null then null else s.end_date::timestamptz + interval '1 day' end,70),
    (s.id,s.organisation_id,'posttraining_documents','after','shared','Finaliser les éléments postformation','Les pièces de clôture seront suivies automatiquement avec la gestion documentaire.',case when s.end_date is null then null else s.end_date::timestamptz + interval '3 days' end,80),
    (s.id,s.organisation_id,'selen_closure_review','after','selen','Effectuer la revue de clôture Selen','Contrôle interne final du dossier avant classement.',case when s.end_date is null then null else s.end_date::timestamptz + interval '5 days' end,90)
  on conflict(session_id,item_key) do nothing;
end; $$;

revoke execute on function public.daily_seed_session_dossier(uuid) from public,anon,authenticated;
grant execute on function public.daily_seed_session_dossier(uuid) to service_role;

create or replace function public.daily_seed_session_dossier_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.daily_seed_session_dossier(new.id);
  return new;
end; $$;
revoke execute on function public.daily_seed_session_dossier_trigger() from public,anon,authenticated;
grant execute on function public.daily_seed_session_dossier_trigger() to service_role;

drop trigger if exists daily_sessions_seed_dossier on public.daily_sessions;
create trigger daily_sessions_seed_dossier after insert on public.daily_sessions
for each row execute function public.daily_seed_session_dossier_trigger();

create or replace function public.daily_sync_session_checklist_notification(p_item_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  item public.daily_session_checklist_items%rowtype;
  dossier public.daily_session_dossiers%rowtype;
  org_name text;
  formation_title text;
  source_key_value text;
  is_attention boolean;
  assignment_user_id uuid;
begin
  select * into item from public.daily_session_checklist_items where id=p_item_id;
  if not found then
    delete from public.notifications where source_key='daily_session_checklist:'||p_item_id::text;
    return;
  end if;
  select * into dossier from public.daily_session_dossiers where session_id=item.session_id;
  source_key_value:='daily_session_checklist:'||item.id::text;
  is_attention:=item.status in ('todo','to_review','blocked');
  select o.name into org_name from public.organisations o where o.id=item.organisation_id;
  select f.title into formation_title from public.daily_sessions s join public.daily_formations f on f.id=s.formation_id where s.id=item.session_id;
  select ap.user_id into assignment_user_id from public.agent_profiles ap where ap.id=dossier.assigned_agent_profile_id and ap.is_active=true;

  if not is_attention then
    update public.notifications set dismissed_at=coalesce(dismissed_at,now()),read_at=coalesce(read_at,now()) where source_key=source_key_value;
    return;
  end if;

  insert into public.notifications(type,title,content,organisation_name,link_path,target_role,target_user_id,target_agent_profile_id,pinned,read_at,dismissed_at,escalation_at,created_at,source_key,source_kind)
  values(
    'daily_session_checklist',
    case item.status when 'blocked' then 'Dossier de session bloqué' when 'to_review' then 'Dossier de session à vérifier' else 'Action dossier de session' end,
    coalesce(formation_title,'Session Daily')||' · '||item.label,
    org_name,
    '/agent/daily/session-dossiers/'||item.session_id::text,
    case when dossier.assigned_agent_profile_id is null then 'admin' else 'agent' end,
    assignment_user_id,dossier.assigned_agent_profile_id,false,null,null,item.signaled_at+interval '72 hours',item.signaled_at,source_key_value,'daily_session_checklist'
  )
  on conflict(source_key) where source_key is not null do update set
    title=excluded.title,content=excluded.content,organisation_name=excluded.organisation_name,link_path=excluded.link_path,
    target_role=excluded.target_role,target_user_id=excluded.target_user_id,target_agent_profile_id=excluded.target_agent_profile_id,
    escalation_at=excluded.escalation_at,dismissed_at=null,
    read_at=case when public.notifications.dismissed_at is not null or public.notifications.target_agent_profile_id is distinct from excluded.target_agent_profile_id or public.notifications.title is distinct from excluded.title or public.notifications.content is distinct from excluded.content then null else public.notifications.read_at end;
end; $$;

revoke execute on function public.daily_sync_session_checklist_notification(uuid) from public,anon,authenticated;
grant execute on function public.daily_sync_session_checklist_notification(uuid) to service_role;

create or replace function public.daily_sync_session_checklist_notification_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='DELETE' then
    delete from public.notifications where source_key='daily_session_checklist:'||old.id::text;
    return old;
  end if;
  perform public.daily_sync_session_checklist_notification(new.id);
  return new;
end; $$;
revoke execute on function public.daily_sync_session_checklist_notification_trigger() from public,anon,authenticated;
grant execute on function public.daily_sync_session_checklist_notification_trigger() to service_role;

drop trigger if exists daily_session_checklist_notification on public.daily_session_checklist_items;
create trigger daily_session_checklist_notification after insert or update or delete on public.daily_session_checklist_items
for each row execute function public.daily_sync_session_checklist_notification_trigger();

create or replace function public.daily_resync_session_assignment_notifications()
returns trigger language plpgsql security definer set search_path=public as $$
declare item_id uuid;
begin
  new.updated_at:=now();
  if new.assigned_agent_profile_id is distinct from old.assigned_agent_profile_id then
    new.assigned_at:=case when new.assigned_agent_profile_id is null then null else now() end;
  end if;
  return new;
end; $$;
revoke execute on function public.daily_resync_session_assignment_notifications() from public,anon,authenticated;
grant execute on function public.daily_resync_session_assignment_notifications() to service_role;

drop trigger if exists daily_session_dossier_assignment_timestamps on public.daily_session_dossiers;
create trigger daily_session_dossier_assignment_timestamps before update on public.daily_session_dossiers
for each row execute function public.daily_resync_session_assignment_notifications();

create or replace function public.daily_resync_session_assignment_notifications_after()
returns trigger language plpgsql security definer set search_path=public as $$
declare item_id uuid;
begin
  if new.assigned_agent_profile_id is distinct from old.assigned_agent_profile_id then
    for item_id in select id from public.daily_session_checklist_items where session_id=new.session_id loop
      perform public.daily_sync_session_checklist_notification(item_id);
    end loop;
  end if;
  return new;
end; $$;
revoke execute on function public.daily_resync_session_assignment_notifications_after() from public,anon,authenticated;
grant execute on function public.daily_resync_session_assignment_notifications_after() to service_role;

drop trigger if exists daily_session_dossier_assignment_notifications on public.daily_session_dossiers;
create trigger daily_session_dossier_assignment_notifications after update on public.daily_session_dossiers
for each row execute function public.daily_resync_session_assignment_notifications_after();

-- Staff manage the complete dossier; clients only see their organisation's non-Selen checklist items.
create policy "Selen staff manage Daily session dossiers" on public.daily_session_dossiers for all to authenticated
using (public.daily_is_selen_staff()) with check (public.daily_is_selen_staff());
create policy "Organisation members read own Daily session dossier" on public.daily_session_dossiers for select to authenticated
using (public.has_active_organisation_membership(organisation_id));

create policy "Selen staff manage Daily session checklist" on public.daily_session_checklist_items for all to authenticated
using (public.daily_is_selen_staff()) with check (public.daily_is_selen_staff());
create policy "Organisation members read visible Daily session checklist" on public.daily_session_checklist_items for select to authenticated
using (responsibility <> 'selen' and public.has_active_organisation_membership(organisation_id));
create policy "Organisation members update own Daily session checklist" on public.daily_session_checklist_items for update to authenticated
using (responsibility in ('client','shared') and public.has_active_organisation_membership(organisation_id))
with check (responsibility in ('client','shared') and public.has_active_organisation_membership(organisation_id));

grant select on public.daily_session_dossiers to authenticated;
grant select,update on public.daily_session_checklist_items to authenticated;
grant all on public.daily_session_dossiers,public.daily_session_checklist_items to service_role;
