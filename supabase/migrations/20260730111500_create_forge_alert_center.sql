-- Centre d'alertes interne de La Forge, dérivé des objets métier existants.

create table public.forge_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null,
  level text not null,
  title text not null,
  message text not null,
  companion_key text not null default 'cody',
  mission_id uuid references public.forge_missions(id) on delete cascade,
  incident_id uuid references public.forge_mission_incidents(id) on delete cascade,
  checkpoint_id uuid references public.forge_mission_checkpoints(id) on delete set null,
  plan_id uuid references public.forge_mission_plans(id) on delete set null,
  action_target text not null,
  action_label text not null default 'Voir le contexte',
  status text not null,
  deduplication_key text not null,
  technical_details jsonb not null default '{}'::jsonb,
  external_channel_eligible boolean not null default false,
  external_follow_up_after timestamptz,
  external_delivery_status text not null default 'not_planned',
  created_at timestamptz not null default now(),
  read_at timestamptz,
  resolved_at timestamptz,
  archived_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint forge_alerts_type_check check (alert_type in (
    'mission_blocked', 'plan_validation_required', 'human_decision_required',
    'critical_incident', 'mission_ready_to_resume', 'mission_completed',
    'mission_failed', 'final_report_available', 'preview_available',
    'important_warning'
  )),
  constraint forge_alerts_level_check check (
    level in ('information', 'attention', 'important', 'critical')
  ),
  constraint forge_alerts_status_check check (
    status in ('unread', 'read', 'action_required', 'resolved', 'archived')
  ),
  constraint forge_alerts_content_check check (
    length(trim(title)) > 0 and length(trim(message)) > 0
    and length(trim(action_target)) > 0 and length(trim(deduplication_key)) > 0
  ),
  constraint forge_alerts_dates_check check (
    (status in ('resolved', 'archived') or resolved_at is null)
    and (status = 'archived' or archived_at is null)
    and (archived_at is null or resolved_at is not null)
  ),
  constraint forge_alerts_external_status_check check (
    external_delivery_status in ('not_planned', 'eligible', 'scheduled', 'sent', 'failed')
  )
);

create unique index forge_alerts_active_deduplication_idx
  on public.forge_alerts(deduplication_key)
  where status not in ('resolved', 'archived');
create index forge_alerts_priority_idx
  on public.forge_alerts(status, level, created_at desc);
create index forge_alerts_mission_idx
  on public.forge_alerts(mission_id, created_at desc);
create index forge_alerts_companion_idx
  on public.forge_alerts(companion_key, created_at desc);

alter table public.forge_alerts enable row level security;
revoke all on table public.forge_alerts from public, anon, authenticated;
grant select, update on table public.forge_alerts to authenticated;

create policy "Studio staff can read Forge alerts"
on public.forge_alerts for select to authenticated
using (public.forge_current_access_level() in ('viewer', 'admin'));

create policy "Studio admins can update Forge alerts"
on public.forge_alerts for update to authenticated
using (public.forge_current_access_level() = 'admin')
with check (public.forge_current_access_level() = 'admin');

create or replace function public.forge_emit_alert(
  p_alert_type text,
  p_level text,
  p_title text,
  p_message text,
  p_status text,
  p_deduplication_key text,
  p_mission_id uuid,
  p_action_target text,
  p_incident_id uuid default null,
  p_checkpoint_id uuid default null,
  p_plan_id uuid default null,
  p_technical_details jsonb default '{}'::jsonb,
  p_external_channel_eligible boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  alert_id uuid;
begin
  insert into public.forge_alerts (
    alert_type, level, title, message, status, deduplication_key,
    mission_id, incident_id, checkpoint_id, plan_id, action_target,
    technical_details, external_channel_eligible, external_delivery_status
  ) values (
    p_alert_type, p_level, trim(p_title), trim(p_message), p_status,
    trim(p_deduplication_key), p_mission_id, p_incident_id, p_checkpoint_id,
    p_plan_id, p_action_target, coalesce(p_technical_details, '{}'::jsonb),
    p_external_channel_eligible,
    case when p_external_channel_eligible then 'eligible' else 'not_planned' end
  )
  on conflict (deduplication_key)
    where status not in ('resolved', 'archived')
  do update set
    level = excluded.level,
    title = excluded.title,
    message = excluded.message,
    action_target = excluded.action_target,
    technical_details = excluded.technical_details,
    updated_at = now()
  returning id into alert_id;
  return alert_id;
end;
$$;

create or replace function public.forge_resolve_source_alerts(
  p_deduplication_key text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.forge_alerts
  set status = 'resolved', resolved_at = coalesce(resolved_at, now()), updated_at = now()
  where deduplication_key = p_deduplication_key
    and status not in ('resolved', 'archived');
$$;

create or replace function public.forge_sync_mission_alerts()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target text := '/agent/forge/cody?mission=' || new.id::text;
begin
  if new.status = 'blocked' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.forge_emit_alert(
      'mission_blocked', 'important', 'J’ai mis cette mission en pause',
      'Lil, je me suis arrêté pour protéger la mission. Ouvre-la pour voir ce qui me bloque et l’action dont j’ai besoin.',
      'action_required', 'mission-blocked:' || new.id::text, new.id, target,
      p_technical_details => jsonb_build_object('mission_status', new.status),
      p_external_channel_eligible => true
    );
  elsif tg_op = 'UPDATE' and old.status = 'blocked' and new.status <> 'blocked' then
    perform public.forge_resolve_source_alerts('mission-blocked:' || new.id::text);
  end if;

  if new.status = 'failed' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.forge_emit_alert(
      'mission_failed', 'critical', 'Je n’ai pas pu terminer cette mission',
      'Lil, la mission a échoué malgré les tentatives prévues. J’ai besoin que tu regardes le contexte avant que je poursuive.',
      'action_required', 'mission-failed:' || new.id::text || ':' || new.updated_at::text,
      new.id, target, p_external_channel_eligible => true
    );
  end if;

  if new.status = 'validated' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.forge_emit_alert(
      'mission_completed', 'information', 'La mission est terminée',
      'Lil, j’ai terminé cette mission. Tu peux ouvrir son contexte pour retrouver les résultats et les vérifications.',
      'unread', 'mission-completed:' || new.id::text, new.id, target
    );
  end if;
  return new;
end;
$$;

create trigger forge_missions_sync_alerts
after insert or update of status on public.forge_missions
for each row execute function public.forge_sync_mission_alerts();

create or replace function public.forge_sync_plan_alerts()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  key text := 'plan-validation:' || new.id::text;
begin
  if new.is_current and new.status = 'plan_ready' then
    perform public.forge_emit_alert(
      'plan_validation_required', 'important', 'J’ai besoin de ta validation',
      'Lil, le plan de cette mission est prêt. Valide-le, demande une modification ou refuse-le avant que je continue.',
      'action_required', key, new.mission_id,
      '/agent/forge/cody?mission=' || new.mission_id::text,
      p_plan_id => new.id,
      p_technical_details => jsonb_build_object('plan_version', new.version),
      p_external_channel_eligible => true
    );
  else
    perform public.forge_resolve_source_alerts(key);
  end if;
  return new;
end;
$$;

create trigger forge_mission_plans_sync_alerts
after insert or update of status, is_current on public.forge_mission_plans
for each row execute function public.forge_sync_plan_alerts();

create or replace function public.forge_sync_incident_alerts()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  key text := 'incident:' || new.id::text;
  target text := '/agent/forge/cody?mission=' || new.mission_id::text;
begin
  if new.resolution_status not in ('resolved', 'ignored_with_justification')
    and new.category in ('critical_error', 'human_decision_required') then
    perform public.forge_emit_alert(
      case when new.category = 'critical_error' then 'critical_incident'
        else 'human_decision_required' end,
      case when new.category = 'critical_error' then 'critical' else 'important' end,
      case when new.category = 'critical_error'
        then 'J’ai détecté un risque important'
        else 'J’ai besoin de ta décision' end,
      case when new.category = 'critical_error'
        then 'Lil, j’ai détecté un risque pour la mission et je me suis arrêté sans aller plus loin.'
        else 'Lil, j’ai besoin que tu choisisses la suite avant que je puisse continuer cette mission.' end,
      'action_required', key, new.mission_id, target, new.id, new.checkpoint_id,
      p_technical_details => jsonb_build_object('code', new.code, 'category', new.category),
      p_external_channel_eligible => true
    );
  else
    perform public.forge_resolve_source_alerts(key);
    if tg_op = 'UPDATE'
      and old.resolution_status not in ('resolved', 'ignored_with_justification')
      and new.resolution_status in ('resolved', 'ignored_with_justification')
      and not exists (
        select 1 from public.forge_mission_incidents i
        where i.mission_id = new.mission_id and i.id <> new.id
          and i.resolution_status in ('detected', 'retrying', 'blocked', 'failed')
      ) then
      perform public.forge_emit_alert(
        'mission_ready_to_resume', 'attention', 'La mission peut reprendre',
        'Lil, le blocage est levé. La mission est prête à reprendre depuis son dernier checkpoint valide.',
        'unread', 'mission-ready:' || new.mission_id::text || ':' || new.id::text,
        new.mission_id, target, new.id, new.checkpoint_id
      );
    end if;
  end if;
  return new;
end;
$$;

create trigger forge_mission_incidents_sync_alerts
after insert or update of resolution_status on public.forge_mission_incidents
for each row execute function public.forge_sync_incident_alerts();

create or replace function public.forge_sync_report_alerts()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target text := '/agent/forge/cody?mission=' || new.mission_id::text;
begin
  if new.status = 'ready' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.forge_emit_alert(
      'final_report_available', 'information', 'Le rapport est disponible',
      'Lil, le rapport de cette mission est prêt. Tu peux le consulter, le copier ou le télécharger dans La Forge.',
      'unread', 'report-ready:' || new.id::text || ':' || new.generated_at::text,
      new.mission_id, target,
      p_technical_details => jsonb_build_object('report_id', new.id)
    );
    if nullif(trim(coalesce(new.preview_url, '')), '') is not null then
      perform public.forge_emit_alert(
        'preview_available', 'information', 'La Preview est prête',
        'Lil, la Preview de cette mission est disponible. Tu peux l’ouvrir depuis le rapport pour la vérifier.',
        'unread', 'preview-ready:' || new.id::text || ':' || new.preview_url,
        new.mission_id, target,
        p_technical_details => jsonb_build_object('preview_url', new.preview_url)
      );
    end if;
  end if;
  return new;
end;
$$;

create trigger forge_mission_reports_sync_alerts
after insert or update of status on public.forge_mission_reports
for each row execute function public.forge_sync_report_alerts();

create or replace function public.forge_mark_alerts_read(p_alert_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare affected integer;
begin
  perform public.forge_require_admin();
  update public.forge_alerts
  set read_at = coalesce(read_at, now()),
      status = case when status = 'unread' then 'read' else status end,
      updated_at = now()
  where id = any(p_alert_ids);
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.forge_archive_alert(p_alert_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.forge_require_admin();
  update public.forge_alerts
  set status = 'archived', archived_at = now(), updated_at = now()
  where id = p_alert_id and status = 'resolved';
  if not found then
    raise exception 'Seule une alerte résolue peut être archivée';
  end if;
end;
$$;

revoke all on function public.forge_emit_alert(text, text, text, text, text, text, uuid, text, uuid, uuid, uuid, jsonb, boolean)
  from public, anon, authenticated;
revoke all on function public.forge_resolve_source_alerts(text)
  from public, anon, authenticated;
revoke all on function public.forge_sync_mission_alerts()
  from public, anon, authenticated;
revoke all on function public.forge_sync_plan_alerts()
  from public, anon, authenticated;
revoke all on function public.forge_sync_incident_alerts()
  from public, anon, authenticated;
revoke all on function public.forge_sync_report_alerts()
  from public, anon, authenticated;
revoke all on function public.forge_mark_alerts_read(uuid[])
  from public, anon;
grant execute on function public.forge_mark_alerts_read(uuid[]) to authenticated;
revoke all on function public.forge_archive_alert(uuid)
  from public, anon;
grant execute on function public.forge_archive_alert(uuid) to authenticated;

