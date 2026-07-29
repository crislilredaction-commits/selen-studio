-- Rapports persistants des missions de La Forge.
-- Aucun rapport ni aucune mission de démonstration ne sont insérés.

create table if not exists public.forge_mission_reports (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null unique
    references public.forge_missions(id) on delete cascade,
  status text not null default 'pending',
  summary text,
  markdown_content text,
  files_created integer not null default 0,
  files_modified integer not null default 0,
  files_deleted integer not null default 0,
  lint_status text,
  build_status text,
  tests_status text,
  git_repository text,
  git_branch text,
  commit_sha text,
  commit_message text,
  preview_url text,
  risks jsonb not null default '[]'::jsonb,
  limitations jsonb not null default '[]'::jsonb,
  manual_test_items jsonb not null default '[]'::jsonb,
  next_recommendation text,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forge_mission_reports_status_check check (
    status in ('pending', 'generating', 'ready', 'failed', 'outdated')
  ),
  constraint forge_mission_reports_file_counts_check check (
    files_created >= 0 and files_modified >= 0 and files_deleted >= 0
  ),
  constraint forge_mission_reports_lint_status_check check (
    lint_status is null
      or lint_status in ('pending', 'passed', 'failed', 'warnings', 'not_run')
  ),
  constraint forge_mission_reports_build_status_check check (
    build_status is null
      or build_status in ('pending', 'passed', 'failed', 'warnings', 'not_run')
  ),
  constraint forge_mission_reports_tests_status_check check (
    tests_status is null
      or tests_status in ('pending', 'passed', 'failed', 'warnings', 'not_run')
  ),
  constraint forge_mission_reports_risks_array_check check (
    jsonb_typeof(risks) = 'array'
  ),
  constraint forge_mission_reports_limitations_array_check check (
    jsonb_typeof(limitations) = 'array'
  ),
  constraint forge_mission_reports_manual_tests_array_check check (
    jsonb_typeof(manual_test_items) = 'array'
  )
);

create index if not exists forge_mission_reports_status_idx
  on public.forge_mission_reports(status);
create index if not exists forge_mission_reports_generated_at_idx
  on public.forge_mission_reports(generated_at desc);

drop trigger if exists forge_mission_reports_set_updated_at
  on public.forge_mission_reports;
create trigger forge_mission_reports_set_updated_at
before update on public.forge_mission_reports
for each row execute function public.set_forge_updated_at();

create or replace function public.mark_forge_mission_report_outdated()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if row(
    old.title,
    old.project_key,
    old.description,
    old.objective,
    old.scope,
    old.expected_result,
    old.priority,
    old.status,
    old.progress,
    old.git_branch,
    old.preview_url,
    old.deployed_at,
    old.validated_at
  ) is distinct from row(
    new.title,
    new.project_key,
    new.description,
    new.objective,
    new.scope,
    new.expected_result,
    new.priority,
    new.status,
    new.progress,
    new.git_branch,
    new.preview_url,
    new.deployed_at,
    new.validated_at
  ) then
    update public.forge_mission_reports
    set status = 'outdated'
    where mission_id = new.id
      and status <> 'generating';
  end if;

  return new;
end;
$$;

drop trigger if exists forge_missions_mark_report_outdated
  on public.forge_missions;
create trigger forge_missions_mark_report_outdated
after update on public.forge_missions
for each row execute function public.mark_forge_mission_report_outdated();

create or replace function public.mark_forge_validation_report_outdated()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_mission_id uuid;
begin
  target_mission_id := case when tg_op = 'DELETE' then old.mission_id else new.mission_id end;

  update public.forge_mission_reports
  set status = 'outdated'
  where mission_id = target_mission_id
    and status <> 'generating';

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists forge_validation_items_mark_report_outdated
  on public.forge_validation_items;
create trigger forge_validation_items_mark_report_outdated
after insert or update or delete on public.forge_validation_items
for each row execute function public.mark_forge_validation_report_outdated();

alter table public.forge_activity_logs
  drop constraint if exists forge_activity_logs_event_type_check;
alter table public.forge_activity_logs
  add constraint forge_activity_logs_event_type_check check (
    event_type in (
      'mission_received', 'analysis', 'development', 'test', 'error',
      'correction', 'build', 'deployment', 'blocked', 'completed',
      'user_validation', 'report_generated', 'report_updated', 'report_failed'
    )
  );

alter table public.forge_mission_reports enable row level security;

revoke all on table public.forge_mission_reports from anon, authenticated;
grant select, insert, update, delete
  on table public.forge_mission_reports
  to authenticated;

drop policy if exists "Studio staff can manage Forge mission reports"
  on public.forge_mission_reports;
create policy "Studio staff can manage Forge mission reports"
on public.forge_mission_reports
for all
to authenticated
using (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role in ('agent', 'admin')
      and (
        ap.user_id = (select auth.uid())
        or lower(ap.email) = lower((select auth.jwt()) ->> 'email')
      )
  )
)
with check (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role in ('agent', 'admin')
      and (
        ap.user_id = (select auth.uid())
        or lower(ap.email) = lower((select auth.jwt()) ->> 'email')
      )
  )
);

revoke all on function public.mark_forge_mission_report_outdated()
  from public, anon, authenticated;
revoke all on function public.mark_forge_validation_report_outdated()
  from public, anon, authenticated;
