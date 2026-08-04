-- Archivage réversible des missions Forge sans altérer leur statut final.

alter table public.forge_missions
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid;

alter table public.forge_missions
  drop constraint if exists forge_missions_archived_by_fkey,
  add constraint forge_missions_archived_by_fkey
    foreign key (archived_by) references auth.users(id) on delete restrict,
  drop constraint if exists forge_missions_archiving_pair_check,
  add constraint forge_missions_archiving_pair_check check (
    (archived_at is null and archived_by is null)
    or (archived_at is not null and archived_by is not null)
  );

create index if not exists forge_missions_active_queue_idx
  on public.forge_missions(agent_key, priority, created_at, id)
  where archived_at is null;

create index if not exists forge_missions_archives_idx
  on public.forge_missions(archived_at desc, status, agent_key)
  where archived_at is not null;

alter table public.forge_human_decisions
  drop constraint forge_human_decisions_action_check;
alter table public.forge_human_decisions
  add constraint forge_human_decisions_action_check check (action in (
    'plan_validated', 'plan_rejected', 'change_requested',
    'mission_paused', 'mission_resumed', 'block_maintained',
    'incident_resolved', 'mission_abandoned', 'mission_archived',
    'mission_restored'
  ));

create or replace function public.forge_guard_mission_archiving()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.archived_at is distinct from old.archived_at
    or new.archived_by is distinct from old.archived_by then
    perform public.forge_require_admin();

    if old.archived_at is null and new.archived_at is not null then
      if old.status not in ('validated', 'failed', 'abandoned') then
        raise exception 'Seule une mission terminee, echouee ou abandonnee peut etre archivee';
      end if;
      if new.archived_by is distinct from (select auth.uid()) then
        raise exception 'L administratrice connectee doit etre l auteur de l archivage';
      end if;
    elsif old.archived_at is not null and new.archived_at is null then
      if new.archived_by is not null then
        raise exception 'La restauration doit retirer toutes les metadonnees d archivage';
      end if;
    else
      raise exception 'Transition d archivage incoherente';
    end if;
  end if;

  if old.archived_at is not null and new.status is distinct from old.status then
    raise exception 'Le statut final d une mission archivee ne peut pas etre modifie';
  end if;

  return new;
end
$$;

drop trigger if exists forge_missions_archiving_guard
  on public.forge_missions;
create trigger forge_missions_archiving_guard
before update of archived_at, archived_by, status
on public.forge_missions
for each row execute function public.forge_guard_mission_archiving();

revoke all on function public.forge_guard_mission_archiving()
  from public, anon, authenticated;

create or replace function public.forge_set_mission_archived(
  p_mission_id uuid,
  p_archived boolean,
  p_reason text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  mission_status text;
  current_archived_at timestamptz;
  actor_id uuid := (select auth.uid());
begin
  perform public.forge_require_admin();
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Un motif explicite est obligatoire';
  end if;

  select status, archived_at
  into mission_status, current_archived_at
  from public.forge_missions
  where id = p_mission_id
  for update;

  if mission_status is null then
    raise exception 'Mission introuvable';
  end if;

  if p_archived then
    if current_archived_at is not null then
      raise exception 'Cette mission est deja archivee';
    end if;
    if mission_status not in ('validated', 'failed', 'abandoned') then
      raise exception 'Seule une mission terminee, echouee ou abandonnee peut etre archivee';
    end if;

    update public.forge_missions
    set archived_at = now(), archived_by = actor_id
    where id = p_mission_id;
  else
    if current_archived_at is null then
      raise exception 'Cette mission n est pas archivee';
    end if;

    update public.forge_missions
    set archived_at = null, archived_by = null
    where id = p_mission_id;
  end if;

  insert into public.forge_human_decisions(
    mission_id, action, reason, consequences, previous_status,
    resulting_status, decided_by
  ) values (
    p_mission_id,
    case when p_archived then 'mission_archived' else 'mission_restored' end,
    trim(p_reason),
    case when p_archived
      then 'Mission retiree des listes actives ; rapport et historique conserves'
      else 'Mission rendue visible sans reprise automatique ni changement de statut'
    end,
    mission_status,
    mission_status,
    actor_id
  );

  insert into public.forge_activity_logs(mission_id, event_type, message, metadata)
  values (
    p_mission_id,
    'completed',
    case when p_archived
      then 'Mission archivee par decision humaine'
      else 'Mission restauree dans les listes visibles'
    end,
    jsonb_build_object(
      'status', mission_status,
      'archived', p_archived,
      'reason', trim(p_reason)
    )
  );
end
$$;

revoke all on function public.forge_set_mission_archived(uuid,boolean,text)
  from public, anon;
grant execute on function public.forge_set_mission_archived(uuid,boolean,text)
  to authenticated;

create or replace function public.forge_control_mission(
  p_mission_id uuid,
  p_action text,
  p_reason text,
  p_consequences text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_status text;
  new_status text;
begin
  perform public.forge_require_admin();
  if length(trim(coalesce(p_reason, ''))) < 3
    or length(trim(coalesce(p_consequences, ''))) < 3 then
    raise exception 'Le motif et les consequences doivent etre confirmes';
  end if;

  if p_action = 'archive' then
    perform public.forge_set_mission_archived(p_mission_id, true, p_reason);
    return;
  end if;

  select status into old_status from public.forge_missions
  where id = p_mission_id for update;
  if old_status is null then raise exception 'Mission introuvable'; end if;

  if p_action = 'abandon' then
    if old_status in ('validated', 'abandoned', 'archived') then
      raise exception 'Cette mission ne peut plus etre abandonnee';
    end if;
    new_status := 'abandoned';
  elsif p_action = 'maintain_block' then
    if old_status <> 'blocked' then
      raise exception 'Seule une mission bloquee peut rester bloquee';
    end if;
    new_status := 'blocked';
  else
    raise exception 'Action de pilotage inconnue';
  end if;

  update public.forge_missions set status = new_status where id = p_mission_id;
  insert into public.forge_human_decisions(
    mission_id, action, reason, consequences, previous_status,
    resulting_status, decided_by
  ) values (
    p_mission_id,
    case p_action when 'abandon' then 'mission_abandoned'
      else 'block_maintained' end,
    trim(p_reason), trim(p_consequences), old_status, new_status,
    (select auth.uid())
  );
  insert into public.forge_activity_logs(mission_id, event_type, message, metadata)
  values (
    p_mission_id,
    case when p_action = 'maintain_block' then 'blocked' else 'completed' end,
    case p_action when 'abandon' then 'Mission abandonnee par decision humaine'
      else 'Blocage maintenu par decision humaine' end,
    jsonb_build_object('previous_status', old_status, 'status', new_status, 'reason', trim(p_reason))
  );
end
$$;

revoke all on function public.forge_control_mission(uuid,text,text,text)
  from public, anon;
grant execute on function public.forge_control_mission(uuid,text,text,text)
  to authenticated;
